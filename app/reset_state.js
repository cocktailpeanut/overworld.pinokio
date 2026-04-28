const fs = require("fs")
const path = require("path")

const root = __dirname
const targets = [
  "biome/server-components/.venv",
  "biome/server-components/uv.lock",
  "biome/server-components/server.log",
  "cache"
]

for (const target of targets) {
  const resolved = path.resolve(root, target)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to remove path outside app: ${target}`)
  }
  fs.rmSync(resolved, { recursive: true, force: true })
}
