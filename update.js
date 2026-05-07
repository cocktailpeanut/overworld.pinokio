module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "git pull"
        ]
      }
    },
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
          TORCHINDUCTOR_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/torchinductor')}}",
          TRITON_CACHE_DIR: "{{kernel.path('cache/overworld.pinokio.git/triton')}}",
          PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True"
        },
        message: [
          "uv sync"
        ]
      }
    },
    {
      when: "{{exists('app/cache/prepared/low.json')}}",
      method: "fs.rm",
      params: {
        path: "app/cache/prepared/low.json"
      }
    }
  ]
}
