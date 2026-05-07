from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match, Mount


ROOT = Path(__file__).resolve().parent
BIOME_SERVER = ROOT / "biome" / "server-components"
SEEDS_ROOT = ROOT / "biome" / "seeds"
WEB_ROOT = ROOT / "web"

if str(BIOME_SERVER) not in sys.path:
    sys.path.insert(0, str(BIOME_SERVER))

from main import StartupConfig, app  # noqa: E402


class HttpOnlyMount(Mount):
    def matches(self, scope):
        if scope["type"] != "http":
            return Match.NONE, {}
        return super().matches(scope)


app.routes.append(HttpOnlyMount("/seeds", app=StaticFiles(directory=SEEDS_ROOT), name="seeds"))
app.routes.append(HttpOnlyMount("/", app=StaticFiles(directory=WEB_ROOT, html=True), name="web"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Overworld Waypoint web launcher")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7987)
    args = parser.parse_args()

    print(f"http://{args.host}:{args.port}", flush=True)
    app.state.startup_config = StartupConfig(parent_pid=None)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        ws_ping_interval=300,
        ws_ping_timeout=300,
        log_config=None,
    )


if __name__ == "__main__":
    main()
