module.exports = {
  requires: {
    bundle: "ai"
  },
  run: [
    {
      when: "{{!exists('app/biome')}}",
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "git clone --filter=blob:none --no-checkout https://github.com/Overworldai/Biome.git biome"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/biome",
        message: [
          "git sparse-checkout init --cone",
          "git sparse-checkout set server-components seeds",
          "git checkout main"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/biome/server-components",
        venv: ".venv",
        env: {
          TORCHINDUCTOR_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/torchinductor')}}",
          TRITON_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/triton')}}"
        },
        message: [
          "uv sync"
        ]
      }
    },
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
          "uv run python ../../prepare_profile.py --profile low"
        ]
      }
    }
  ]
}
