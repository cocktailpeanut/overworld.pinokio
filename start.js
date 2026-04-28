module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app/biome/server-components",
        venv: ".venv",
        env: {
          TORCHINDUCTOR_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/torchinductor')}}",
          TRITON_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/triton')}}",
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
