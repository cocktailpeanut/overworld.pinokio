module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app/biome/server-components",
        venv: ".venv",
        env: {
          HF_HOME: "../../cache/huggingface",
          TORCH_HOME: "../../cache/torch",
          TORCHINDUCTOR_CACHE_DIR: "../../cache/torchinductor",
          TRITON_CACHE_DIR: "../../cache/triton",
          PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True"
        },
        message: [
          "uv run python ../../launcher.py --host 127.0.0.1 --port {{port}}"
        ],
        on: [{
          event: "/(http:\\/\\/[0-9.:]+)/",
          done: true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
}
