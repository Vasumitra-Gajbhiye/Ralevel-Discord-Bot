const fs = require("node:fs");
const path = require("node:path");
const { PermissionFlagsBits } = require("discord.js");

const commandsRoot = path.resolve(__dirname, "..", "commands");
const outputPath = path.resolve(
  __dirname,
  "../../../packages/shared/src/generated/commandCatalog.json",
);

const bitToName = Object.fromEntries(
  Object.entries(PermissionFlagsBits).map(([name, bit]) => [String(bit), name]),
);

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

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), commands }, null, 2)}\n`,
);

console.log(`Exported ${commands.length} commands to ${outputPath}`);
