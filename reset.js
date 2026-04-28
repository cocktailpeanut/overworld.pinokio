module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "node reset_state.js"
        ]
      }
    }
  ]
}
