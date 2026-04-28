const profiles = {
  low: {
    model: "Overworld/Waypoint-1.5-1B-360P",
    quant: "intw8a8",
    hint: "Lowest VRAM mode. Estimated range: 8-10 GB VRAM."
  },
  balanced: {
    model: "Overworld/Waypoint-1.5-1B-360P",
    quant: null,
    hint: "Sharper 360p BF16 mode. Estimated range: 12-14 GB VRAM."
  },
  quality: {
    model: "Overworld/Waypoint-1.5-1B",
    quant: "intw8a8",
    hint: "720p INT8 mode. Estimated range: 14-16 GB VRAM."
  },
  max: {
    model: "Overworld/Waypoint-1.5-1B",
    quant: null,
    hint: "Highest quality 720p BF16 mode. Estimated range: 18-20 GB VRAM."
  }
}

const seeds = [
  "default.jpg",
  "abandoned_city_runner.jpg",
  "alien_command_center.jpg",
  "ancient_standing_stones.jpg",
  "desert_outpost_hangar.jpg",
  "enchanted_swamp_torch.jpg",
  "frozen_crystal_cavern.jpg",
  "frozen_valley_sniper.jpg",
  "highland_castle_loch.jpg",
  "mountain_ruins_gun.jpg",
  "shattered_cockpit_nebula.jpg",
  "shipwreck_shore_revolver.jpg",
  "snowy_forest_tracks.jpg",
  "stormy_countryside_rifle.jpg",
  "sunken_city_depths.jpg"
]

const canvas = document.querySelector("#view")
const ctx = canvas.getContext("2d")
const stage = document.querySelector("#stage")
const startScreen = document.querySelector("#startScreen")
const seedGallery = document.querySelector("#seedGallery")
const uploadTile = document.querySelector("#uploadTile")
const settingsToggle = document.querySelector("#settingsToggle")
const settingsPanel = document.querySelector("#settingsPanel")
const loadingLogEl = document.querySelector("#loadingLog")
const loadingStateEl = document.querySelector("#loadingState")
const play = document.querySelector("#play")
const lock = document.querySelector("#lock")
const reset = document.querySelector("#reset")
const profile = document.querySelector("#profile")
const profileHint = document.querySelector("#profileHint")
const seed = document.querySelector("#seed")
const seedPicker = document.querySelector("#seedPicker")
const promptInput = document.querySelector("#prompt")
const upload = document.querySelector("#upload")
const logEl = document.querySelector("#log")
const stateEl = document.querySelector("#state")
const fpsEl = document.querySelector("#fps")
const frameEl = document.querySelector("#frame")
const vramEl = document.querySelector("#vram")

let ws = null
let ready = false
let frameCount = 0
let fpsCount = 0
let fpsTick = performance.now()
let keys = new Set()
let mouseDx = 0
let mouseDy = 0
let pointerX = 0
let pointerY = 0
let pointerInside = false
let raf = 0
let objectUrl = null
let uploadedSeed = null
let rpcSeq = 1
let hasWorld = false
let dragDepth = 0
let logLines = []
let pendingInitReqId = null
let resumeAfterInitError = false
let lastWarning = ""
let awaitingInitFrame = false

const POINTER_LOOK_RATE = 18
const POINTER_DEADZONE = 0.08
const POINTER_CURVE = 1.45

function formatSeedName(name) {
  return name.replace(".jpg", "").replaceAll("_", " ")
}

function updateSelectedSeedCards(selected = seed.value) {
  document.querySelectorAll("[data-seed]").forEach((card) => {
    card.classList.toggle("selected", card.dataset.seed === selected)
  })
}

function chooseSeed(name) {
  uploadedSeed = null
  upload.value = ""
  seed.value = name
  updateSelectedSeedCards(name)
  startWorld()
}

function createSeedCard(name, compact = false) {
  const card = document.createElement("button")
  card.className = compact ? "seed-card seed-card-compact" : "seed-card"
  card.type = "button"
  card.dataset.seed = name
  card.innerHTML = `<img src="/seeds/${name}" alt=""><span>${formatSeedName(name)}</span>`
  card.addEventListener("click", (event) => {
    event.stopPropagation()
    chooseSeed(name)
  })
  return card
}

for (const name of seeds) {
  const opt = document.createElement("option")
  opt.value = name
  opt.textContent = formatSeedName(name)
  seed.appendChild(opt)

  seedGallery.appendChild(createSeedCard(name))
  seedPicker.appendChild(createSeedCard(name, true))
}

function setState(text) {
  stateEl.textContent = text
  loadingStateEl.textContent = text
}

function setHasWorld(value) {
  hasWorld = value
  document.body.classList.toggle("has-world", value)
}

function setSettingsOpen(value) {
  document.body.classList.toggle("settings-open", value)
}

function setLoading(value) {
  document.body.classList.toggle("loading", value)
}

function log(line) {
  logLines.push(line)
  logLines = logLines.slice(-240)
  logEl.textContent = logLines.slice(-160).join("\n")
  logEl.scrollTop = logEl.scrollHeight
  loadingLogEl.textContent = logLines.join("\n")
  loadingLogEl.scrollTop = loadingLogEl.scrollHeight
}

function messageText(id) {
  const messages = {
    "app.server.warning.seedUnsafe": "seed image rejected by safety checker",
    "app.server.warning.missingSeedData": "missing seed image data",
    "app.server.warning.invalidSeedData": "invalid seed image data",
    "app.server.warning.seedSafetyCheckFailed": "seed safety check failed",
    "app.server.warning.seedLoadFailed": "seed image could not be loaded",
    "app.server.error.initFailed": "initialization failed"
  }
  return messages[id] || id || "request failed"
}

function updateProfileHint() {
  profileHint.textContent = profiles[profile.value]?.hint || ""
}

function baseUrl() {
  return `${location.protocol}//${location.host}`
}

function wsUrl() {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function seedToBase64() {
  if (uploadedSeed) return uploadedSeed
  const res = await fetch(`/seeds/${seed.value}`)
  if (!res.ok) {
    throw new Error(`seed not found: ${seed.value}`)
  }
  const blob = await res.blob()
  return fileToBase64(blob)
}

async function setUploadedFile(file) {
  if (!file || !file.type.startsWith("image/")) return false
  uploadedSeed = await fileToBase64(file)
  updateSelectedSeedCards("")
  return true
}

function sendRpc(type, payload) {
  const reqId = String(rpcSeq++)
  ws.send(JSON.stringify({ type, req_id: reqId, ...payload }))
  return reqId
}

async function initSession() {
  const selected = profiles[profile.value]
  const seedData = await seedToBase64()
  const liveSession = ready && ws && ws.readyState === WebSocket.OPEN
  setHasWorld(true)
  setLoading(true)
  resumeAfterInitError = liveSession
  lastWarning = ""
  awaitingInitFrame = true
  if (!liveSession) {
    ready = false
    cancelAnimationFrame(raf)
    setState("loading model")
  } else {
    setState("resetting world")
  }
  pendingInitReqId = sendRpc("init", {
    model: selected.model,
    quant: selected.quant,
    prompt: promptInput.value,
    seed_image_data: seedData,
    seed_filename: uploadedSeed ? "uploaded.jpg" : seed.value,
    scene_authoring: false,
    action_logging: false,
    video_recording: false,
    cap_inference_fps: true,
    biome_version: "pinokio-web"
  })
}

function startWorld() {
  setHasWorld(true)
  if (ws && ws.readyState === WebSocket.OPEN) {
    initSession().catch((err) => log(`init error: ${err.message}`))
  } else {
    connect()
  }
}

function parseBinaryFrame(buffer) {
  const view = new DataView(buffer)
  const headerLength = view.getUint32(0, true)
  const headerBytes = new Uint8Array(buffer, 4, headerLength)
  const header = JSON.parse(new TextDecoder().decode(headerBytes))
  const imageBytes = new Uint8Array(buffer, 4 + headerLength)
  return { header, blob: new Blob([imageBytes], { type: "image/jpeg" }) }
}

async function drawFrame(blob, header) {
  const bitmap = await createImageBitmap(blob)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  frameCount = header.frame_id || 0
  frameEl.textContent = `frame ${frameCount}`
  if (typeof header.vram_used_bytes === "number" && header.vram_used_bytes >= 0) {
    vramEl.textContent = `vram ${(header.vram_used_bytes / 1024 ** 3).toFixed(1)} GB`
  }
  fpsCount += 1
  const now = performance.now()
  if (now - fpsTick > 1000) {
    fpsEl.textContent = `${fpsCount} fps`
    fpsCount = 0
    fpsTick = now
  }
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return
  if (ws && ws.readyState === WebSocket.CONNECTING) return
  setHasWorld(true)
  setLoading(true)
  ready = false
  setState("connecting")
  ws = new WebSocket(wsUrl())
  ws.binaryType = "arraybuffer"
  ws.onopen = () => initSession().catch((err) => log(`init error: ${err.message}`))
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const { header, blob } = parseBinaryFrame(event.data)
      drawFrame(blob, header).catch(() => {})
      if (awaitingInitFrame && Number(header.frame_id || 0) <= 1) {
        awaitingInitFrame = false
        setLoading(false)
        ready = true
        setState("playing")
        startInputLoop()
      }
      return
    }
    const msg = JSON.parse(event.data)
    if (msg.type === "status") {
      setState(msg.stage || "status")
      if (msg.stage === "session.ready") {
        ready = true
        pendingInitReqId = null
        resumeAfterInitError = false
        setLoading(false)
        setState("playing")
        startInputLoop()
      }
    } else if (msg.type === "response") {
      if (msg.success) {
        if (msg.req_id === pendingInitReqId && lastWarning) {
          const warning = lastWarning
          log(`error: ${warning}`)
          pendingInitReqId = null
          lastWarning = ""
          awaitingInitFrame = false
          setLoading(false)
          if (resumeAfterInitError) {
            ready = true
            setState("playing")
            startInputLoop()
          } else {
            ready = false
            setState("error")
          }
          return
        }
        log(`ready: ${msg.data?.model || "session"}`)
        if (msg.req_id === pendingInitReqId) {
          pendingInitReqId = null
          resumeAfterInitError = false
          if (!awaitingInitFrame) {
            setLoading(false)
            ready = true
            setState("playing")
            startInputLoop()
          } else {
            setState("resetting world")
          }
        }
      } else {
        const error = lastWarning || messageText(msg.error || msg.error_id)
        log(`error: ${error}`)
        if (msg.req_id === pendingInitReqId) {
          pendingInitReqId = null
          lastWarning = ""
          awaitingInitFrame = false
          setLoading(false)
          if (resumeAfterInitError) {
            ready = true
            setState("playing")
            startInputLoop()
          } else {
            ready = false
            setState("error")
          }
        }
      }
    } else if (msg.type === "warning") {
      const warning = messageText(msg.message_id)
      lastWarning = warning
      log(`warning: ${warning}`)
    } else if (msg.type === "error") {
      setState("error")
      log(`error: ${msg.message || msg.message_id || JSON.stringify(msg)}`)
    } else if (msg.type === "log") {
      const line = String(msg.line || "")
      if (line) log(line)
    } else if (msg.type === "system_info") {
      log(`gpu: ${msg.gpu_name || "unknown"}`)
    }
  }
  ws.onclose = () => {
    ready = false
    cancelAnimationFrame(raf)
    setLoading(false)
    setState("offline")
  }
  ws.onerror = () => setState("error")
}

function buttons() {
  const out = []
  if (keys.has("KeyW")) out.push("W")
  if (keys.has("KeyA")) out.push("A")
  if (keys.has("KeyS")) out.push("S")
  if (keys.has("KeyD")) out.push("D")
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) out.push("SHIFT")
  if (keys.has("Space")) out.push("SPACE")
  if (keys.has("ControlLeft") || keys.has("ControlRight")) out.push("CTRL")
  return out
}

function signedCurve(value) {
  if (Math.abs(value) < POINTER_DEADZONE) return 0
  const sign = Math.sign(value)
  const normalized = (Math.abs(value) - POINTER_DEADZONE) / (1 - POINTER_DEADZONE)
  return sign * normalized ** POINTER_CURVE
}

function applyPointerSteer() {
  if (document.pointerLockElement === stage || !pointerInside) return
  const rect = stage.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const x = ((pointerX - rect.left) / rect.width - 0.5) * 2
  const y = ((pointerY - rect.top) / rect.height - 0.5) * 2
  mouseDx += signedCurve(Math.max(-1, Math.min(1, x))) * POINTER_LOOK_RATE
  mouseDy += signedCurve(Math.max(-1, Math.min(1, y))) * POINTER_LOOK_RATE
}

function startInputLoop() {
  cancelAnimationFrame(raf)
  const tick = () => {
    if (ready && ws && ws.readyState === WebSocket.OPEN) {
      applyPointerSteer()
      ws.send(JSON.stringify({
        type: "control",
        buttons: buttons(),
        mouse_dx: Math.round(mouseDx),
        mouse_dy: Math.round(mouseDy),
        ts: performance.now()
      }))
      mouseDx = 0
      mouseDy = 0
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function requestLock() {
  stage.focus({ preventScroll: true })
  if (!ready) {
    log("mouse lock is available after the world starts")
    return
  }
  const request = stage.requestPointerLock?.()
  if (request?.catch) {
    request.catch(() => log("mouse lock was blocked by the browser"))
  }
}

function isViewTarget(event) {
  return event.target === stage || event.target === canvas || event.target.classList?.contains("reticle")
}

play?.addEventListener("click", startWorld)
lock.addEventListener("click", requestLock)
settingsToggle.addEventListener("click", () => {
  setSettingsOpen(!document.body.classList.contains("settings-open"))
})
uploadTile.addEventListener("click", (event) => {
  event.stopPropagation()
  upload.click()
})
stage.addEventListener("click", (event) => {
  if (!hasWorld && isViewTarget(event)) {
    upload.click()
    return
  }
  if (ready && isViewTarget(event)) requestLock()
})
stage.addEventListener("pointerenter", (event) => {
  pointerInside = isViewTarget(event)
  pointerX = event.clientX
  pointerY = event.clientY
})
stage.addEventListener("pointermove", (event) => {
  pointerInside = isViewTarget(event)
  pointerX = event.clientX
  pointerY = event.clientY
})
stage.addEventListener("pointerleave", () => {
  pointerInside = false
})
reset.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "reset" }))
})
profile.addEventListener("change", () => {
  updateProfileHint()
  if (ws && ws.readyState === WebSocket.OPEN) initSession().catch((err) => log(`init error: ${err.message}`))
})
seed.addEventListener("change", () => {
  chooseSeed(seed.value)
})
promptInput.addEventListener("change", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "prompt", prompt: promptInput.value }))
  }
})
upload.addEventListener("change", async () => {
  const file = upload.files?.[0]
  if (await setUploadedFile(file)) startWorld()
})

stage.addEventListener("dragenter", (event) => {
  event.preventDefault()
  dragDepth += 1
  stage.classList.add("dragging")
})
stage.addEventListener("dragover", (event) => {
  event.preventDefault()
})
stage.addEventListener("dragleave", (event) => {
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) stage.classList.remove("dragging")
})
stage.addEventListener("drop", async (event) => {
  event.preventDefault()
  dragDepth = 0
  stage.classList.remove("dragging")
  const file = event.dataTransfer?.files?.[0]
  if (await setUploadedFile(file)) {
    upload.value = ""
    startWorld()
  }
})

window.addEventListener("keydown", (event) => {
  keys.add(event.code)
  if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) event.preventDefault()
})
window.addEventListener("keyup", (event) => keys.delete(event.code))
window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === stage) {
    mouseDx += event.movementX
    mouseDy += event.movementY
  }
})
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === stage
  stage.classList.toggle("locked", locked)
  lock.setAttribute("aria-label", locked ? "Mouse locked" : "Mouse lock")
  lock.title = locked ? "Mouse locked" : "Mouse lock"
  lock.classList.toggle("active", locked)
})

setState("offline")
updateProfileHint()
updateSelectedSeedCards()
