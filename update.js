module.exports = {
  run: [
    {
      when: "{{exists('app/biome')}}",
      method: "shell.run",
      params: {
        path: "app/biome",
        message: [
          "git pull"
        ]
      }
    },
    {
      when: "{{exists('app/biome/server-components')}}",
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
    }
  ]
}
