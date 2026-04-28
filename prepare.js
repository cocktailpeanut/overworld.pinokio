module.exports = {
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
          "uv run python ../../prepare_profile.py --profile {{args.profile}}"
        ]
      }
    }
  ]
}
