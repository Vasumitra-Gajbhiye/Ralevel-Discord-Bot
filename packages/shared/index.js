const permissions = require("./src/permissions");
const constants = require("./src/constants");
const {
  renderMessageTemplate,
  BAN_MESSAGE_PLACEHOLDERS,
} = require("./src/renderMessageTemplate");

module.exports = {
  permissions,
  constants,
  renderMessageTemplate,
  BAN_MESSAGE_PLACEHOLDERS,
  // Convenience re-exports matching previous bot import shapes
  groups: permissions.groups,
  commands: permissions.commands,
};
