const crypto = require("node:crypto");

function v4() {
  return crypto.randomUUID();
}

module.exports = { v4 };
