module.exports = {
  version: "7.0",
  title: "Overworld",
  description: "[NVIDIA GPU REQUIRED] Realtime world generator by Overworld Waypoint world model",
  icon: "icon.png",
  menu: async (kernel, info) => {
    const installed = info.exists("app/cache/prepared/low.json")
    const dependenciesInstalled = info.exists("app/biome/server-components/.venv")
    const installing = info.running("install.js")
    const running = info.running("start.js")
    const updating = info.running("update.js")
    const resetting = info.running("reset.js")

    if (installing) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.js"
      }]
    }

    if (running) {
      const local = info.local("start.js")
      if (local && local.url) {
        return [{
          default: true,
          icon: "fa-solid fa-gamepad",
          text: "Play",
          href: local.url
        }, {
          icon: "fa-solid fa-terminal",
          text: "Terminal",
          href: "start.js"
        }]
      }
      return [{
        default: true,
        icon: "fa-solid fa-terminal",
        text: "Starting",
        href: "start.js"
      }]
    }

    if (updating) {
      return [{
        default: true,
        icon: "fa-solid fa-arrows-rotate",
        text: "Updating",
        href: "update.js"
      }]
    }

    if (resetting) {
      return [{
        default: true,
        icon: "fa-solid fa-broom",
        text: "Resetting",
        href: "reset.js"
      }]
    }

    if (!dependenciesInstalled) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.js"
      }]
    }

    if (!installed) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Prepare",
        href: "install.js"
      }, {
        icon: "fa-solid fa-broom",
        text: "Reset",
        href: "reset.js"
      }]
    }

    return [{
      default: true,
      icon: "fa-solid fa-power-off",
      text: "Start",
      href: "start.js"
    }, {
      icon: "fa-solid fa-arrows-rotate",
      text: "Update",
      href: "update.js"
    }, {
      icon: "fa-solid fa-plug",
      text: "Install",
      href: "install.js"
    }, {
      icon: "fa-solid fa-broom",
      text: "Reset",
      href: "reset.js"
    }]
  }
}
