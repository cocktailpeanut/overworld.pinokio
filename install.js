module.exports = {
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
          HF_HOME: "../../cache/huggingface",
          TORCH_HOME: "../../cache/torch",
          TORCHINDUCTOR_CACHE_DIR: "../../cache/torchinductor",
          TRITON_CACHE_DIR: "../../cache/triton"
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
          HF_HOME: "../../cache/huggingface",
          TORCH_HOME: "../../cache/torch",
          TORCHINDUCTOR_CACHE_DIR: "../../cache/torchinductor",
          TRITON_CACHE_DIR: "../../cache/triton",
          PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True"
        },
        message: [
          "uv run python ../../prepare_profile.py --profile low"
        ]
      }
    }
  ]
}
