const catalog = require("./generated/commandCatalog.json");

function getCommandCatalog() {
  return catalog.commands;
}

module.exports = {
  getCommandCatalog,
};
