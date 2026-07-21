const permissions = require("./src/permissions");
const constants = require("./src/constants");

module.exports = {
  permissions,
  constants,
  // Convenience re-exports matching previous bot import shapes
  groups: permissions.groups,
  commands: permissions.commands,
};
