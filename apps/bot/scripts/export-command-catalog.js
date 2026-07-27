const fs = require("node:fs");
const path = require("node:path");
const { PermissionFlagsBits } = require("discord.js");

const commandsRoot = path.resolve(__dirname, "..", "commands");
const generatedDir = path.resolve(
  __dirname,
  "../../../packages/shared/src/generated",
);
const outputPath = path.join(generatedDir, "commandCatalog.json");
const bitfieldsPath = path.join(generatedDir, "permissionBitfields.json");

const bitToName = Object.fromEntries(
  Object.entries(PermissionFlagsBits).map(([name, bit]) => [String(bit), name]),
);

const permissionBitfields = Object.fromEntries(
  Object.entries(PermissionFlagsBits).map(([name, bit]) => [name, String(bit)]),
);

function exportCommandCatalog() {
  const commands = [];

  const folders = fs
    .readdirSync(commandsRoot)
    .filter((entry) => fs.statSync(path.join(commandsRoot, entry)).isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(commandsRoot, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of files) {
      const filePath = path.resolve(folderPath, file);
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const command = require(filePath);
      if (!command?.data || !command?.execute) continue;

      const payload = command.data.toJSON();
      const fileDefault = payload.default_member_permissions
        ? bitToName[payload.default_member_permissions] || null
        : null;

      commands.push({
        category: folder,
        name: payload.name,
        fileDefault,
        payload,
      });
    }
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), commands }, null, 2)}\n`,
  );
  fs.writeFileSync(
    bitfieldsPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), bitfields: permissionBitfields }, null, 2)}\n`,
  );

  return {
    commandCount: commands.length,
    outputPath,
    bitfieldsPath,
    bitfieldCount: Object.keys(permissionBitfields).length,
  };
}

module.exports = { exportCommandCatalog };

if (require.main === module) {
  const { commandCount, outputPath: out, bitfieldsPath: bits, bitfieldCount } =
    exportCommandCatalog();
  console.log(`Exported ${commandCount} commands to ${out}`);
  console.log(`Exported ${bitfieldCount} permission bitfields to ${bits}`);
  process.exit(0);
}
