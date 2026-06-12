function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function debug(...args) {
  if (isEnabled(process.env.SERVIIO_DEBUG_LOGS)) {
    console.log(...args);
  }
}

function socketDebug(...args) {
  if (
    isEnabled(process.env.SERVIIO_SOCKET_DEBUG) ||
    isEnabled(process.env.SERVIIO_DEBUG_LOGS)
  ) {
    console.log(...args);
  }
}

module.exports = {
  debug,
  socketDebug,
  isEnabled,
};
