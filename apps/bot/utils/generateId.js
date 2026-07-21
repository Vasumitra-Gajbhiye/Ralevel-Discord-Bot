const crypto = require("crypto");

module.exports = function generateActionId() {
    return crypto.randomUUID();
};