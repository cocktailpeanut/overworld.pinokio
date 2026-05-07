from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BIOME_SERVER = ROOT / "biome" / "server-components"
SEEDS = ROOT / "biome" / "seeds"
CACHE_ROOT = ROOT / "cache"

if str(BIOME_SERVER) not in sys.path:
    sys.path.insert(0, str(BIOME_SERVER))


PROFILES = {
    "low": {
        "label": "Low VRAM 360p INT8",
        "model": "Overworld/Waypoint-1.5-1B-360P",
        "quant": "intw8a8",
    },
    "balanced": {
        "label": "360p BF16",
        "model": "Overworld/Waypoint-1.5-1B-360P",
        "quant": None,
    },
    "quality": {
        "label": "720p INT8",
        "model": "Overworld/Waypoint-1.5-1B",
        "quant": "intw8a8",
    },
    "max": {
        "label": "720p BF16",
        "model": "Overworld/Waypoint-1.5-1B",
        "quant": None,
    },
}

STAGE_MESSAGES = {
    "session.loading_model.import": "Loading WorldEngine code",
    "session.loading_model.load": "Loading model",
    "session.loading_model.instantiate": "Instantiating model weights",
    "session.loading_model.done": "Model load complete",
    "session.warmup.reset": "Warmup 1/4: reset engine state",
    "session.warmup.seed": "Warmup 2/4: append seed frame and compile seed path",
    "session.warmup.prompt": "Warmup 3/4: set prompt conditioning",
    "session.warmup.compile": "Warmup 4/4: generate first frame and compile CUDA graphs",
    "session.init.reset": "Session init 1/3: reset engine state",
    "session.init.seed": "Session init 2/3: append seed frame",
    "session.init.frame": "Session init 3/3: generate initial frame",
    "session.ready": "Session ready",
}


def configure_cache_env() -> None:
    cache_env = {
        "HF_HOME": CACHE_ROOT / "huggingface",
        "TORCH_HOME": CACHE_ROOT / "torch",
        "TORCHINDUCTOR_CACHE_DIR": CACHE_ROOT / "torchinductor",
        "TRITON_CACHE_DIR": CACHE_ROOT / "triton",
    }
    for key, path in cache_env.items():
        os.environ.setdefault(key, str(path))
        Path(os.environ[key]).mkdir(parents=True, exist_ok=True)


class ProgressHeartbeat:
    def __init__(self, interval_seconds: int = 30) -> None:
        self.interval_seconds = interval_seconds
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._stage = "starting"
        self._phase_started = time.perf_counter()
        self._thread: threading.Thread | None = None

    def update(self, message: str) -> None:
        with self._lock:
            self._stage = message
            self._phase_started = time.perf_counter()
        print(f"[prepare] {message}", flush=True)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        started = time.perf_counter()
        while not self._stop.wait(self.interval_seconds):
            now = time.perf_counter()
            with self._lock:
                stage = self._stage
                phase_elapsed = now - self._phase_started
            total_elapsed = now - started
            print(
                "[prepare] Still working: "
                f"{stage} ({phase_elapsed:.0f}s in this step, "
                f"{total_elapsed:.0f}s total). Torch/Triton compile can take several minutes.",
                flush=True,
            )


async def prepare(profile_key: str, seed_name: str) -> dict:
    import torch
    from engine.manager import WorldEngineManager

    profile = PROFILES[profile_key]
    seed_path = SEEDS / seed_name
    if not seed_path.exists():
        raise FileNotFoundError(f"Seed image not found: {seed_path}")

    manager = WorldEngineManager()
    started = time.perf_counter()
    heartbeat = ProgressHeartbeat()

    def on_progress(stage) -> None:
        stage_id = getattr(stage, "id", str(stage))
        heartbeat.update(STAGE_MESSAGES.get(stage_id, stage_id))

    manager.set_progress_callback(on_progress, asyncio.get_running_loop())
    heartbeat.start()

    try:
        print(f"[prepare] Profile: {profile['label']}", flush=True)
        print(f"[prepare] Model: {profile['model']} quant={profile['quant']}", flush=True)
        print(f"[prepare] Seed: {seed_path}", flush=True)

        heartbeat.update("Downloading/loading model files")
        t0 = time.perf_counter()
        await manager.load_engine(profile["model"], quant=profile["quant"])
        load_seconds = time.perf_counter() - t0
        print(f"[prepare] Model loaded in {load_seconds:.2f}s", flush=True)

        heartbeat.update("Loading seed image")
        manager.seed_frame = await manager.load_seed_from_file(str(seed_path))
        manager.original_seed_frame = manager.seed_frame
        if manager.seed_frame is None:
            raise RuntimeError("Failed to load seed image")

        heartbeat.update("Starting warmup compile")
        t0 = time.perf_counter()
        await manager.warmup()
        warmup_seconds = time.perf_counter() - t0
        print(f"[prepare] Warmup completed in {warmup_seconds:.2f}s", flush=True)

        # Run one normal session init after warmup so reset/append paths also land
        # in the same cache directories used by the browser server.
        heartbeat.update("Starting post-warmup session init")
        t0 = time.perf_counter()
        manager.init_session()
        init_seconds = time.perf_counter() - t0
        print(f"[prepare] Session init completed in {init_seconds:.2f}s", flush=True)

        if torch.cuda.is_available():
            torch.cuda.synchronize()
    finally:
        manager.set_progress_callback(None)
        heartbeat.stop()

    total_seconds = time.perf_counter() - started
    result = {
        "profile": profile_key,
        "label": profile["label"],
        "model": profile["model"],
        "quant": profile["quant"],
        "seed": seed_name,
        "load_seconds": round(load_seconds, 2),
        "warmup_seconds": round(warmup_seconds, 2),
        "init_seconds": round(init_seconds, 2),
        "total_seconds": round(total_seconds, 2),
        "cache_root": str(CACHE_ROOT),
        "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    marker_dir = CACHE_ROOT / "prepared"
    marker_dir.mkdir(parents=True, exist_ok=True)
    (marker_dir / f"{profile_key}.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8"
    )
    print(f"[prepare] Prepared {profile['label']} in {total_seconds:.2f}s", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare Overworld Waypoint caches")
    parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    parser.add_argument("--seed", default="default.jpg")
    args = parser.parse_args()

    configure_cache_env()

    import asyncio

    asyncio.run(prepare(args.profile, args.seed))


if __name__ == "__main__":
    main()
