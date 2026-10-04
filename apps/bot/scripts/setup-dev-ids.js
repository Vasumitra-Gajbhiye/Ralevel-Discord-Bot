/**
 * Fill the role/channel IDs in your local .env from your own test server.
 *
 * Test servers are created from the r/alevel server template, so they have the
 * same role and channel *names* but different IDs. dev-server-map.json records
 * which name each env var points to; this script looks those names up in your
 * server (GUILD_ID, via your bot TOKEN) and writes the matching IDs to .env.
 *
 * Usage from repo root:
 *   pnpm setup:ids                                            # fill .env
 *   node apps/bot/scripts/setup-dev-ids.js --export-map       # maintainers: rebuild the map
 *
 * --export-map reads the IDs in the current .env, resolves them to names in
 * GUILD_ID, and rewrites dev-server-map.json. Run it after adding a new
 * role/channel env var, against a .env that points at the template's source server.
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "../../../.env");
const mapPath = path.join(__dirname, "dev-server-map.json");

const API = "https://discord.com/api/v10";
const SNOWFLAKE = /^\d{17,20}$/;
const SKIP_KEYS = new Set(["GUILD_ID", "CLIENT_ID"]);

function readEnv() {
  if (!fs.existsSync(envPath)) {
    fail(`No .env found at ${envPath}. Run: cp .env.example .env`);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  return { raw, values: dotenv.parse(raw) };
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function discordGet(route, token) {
  const res = await fetch(`${API}${route}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.status === 401) fail("Discord rejected TOKEN. Check it in .env.");
  if (res.status === 403 || res.status === 404) {
    fail("Can't read GUILD_ID. Is GUILD_ID right, and is your bot in that server?");
  }
  if (!res.ok) fail(`Discord API ${route} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchGuild(values) {
  const token = values.TOKEN;
  const guildId = values.GUILD_ID;
  if (!token || token.startsWith("your_")) fail("Set TOKEN in .env first.");
  if (!SNOWFLAKE.test(guildId ?? "")) fail("Set GUILD_ID in .env first.");

  const [roles, channels] = await Promise.all([
    discordGet(`/guilds/${guildId}/roles`, token),
    discordGet(`/guilds/${guildId}/channels`, token),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const parentName = (c) => channelById.get(c.parent_id)?.name ?? null;
  return { roles, channels, parentName };
}

/** Parse an env value into a list of IDs plus the format to write it back in. */
function parseIds(value) {
  const trimmed = (value ?? "").trim();
  if (trimmed.startsWith("[")) {
    try {
      const list = JSON.parse(trimmed);
      if (Array.isArray(list)) return { format: "json", ids: list.map(String) };
    } catch {
      return null;
    }
  }
  const ids = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return { format: ids.length > 1 ? "csv" : "single", ids };
}

function formatIds(format, ids) {
  if (format === "json") return JSON.stringify(ids);
  return ids.join(",");
}

async function exportMap() {
  const { values } = readEnv();
  const { roles, channels, parentName } = await fetchGuild(values);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const map = {};
  const unresolved = [];
  for (const [key, value] of Object.entries(values)) {
    if (SKIP_KEYS.has(key)) continue;
    const parsed = parseIds(value);
    if (!parsed || !parsed.ids.every((id) => SNOWFLAKE.test(id))) continue;

    const targets = [];
    for (const id of parsed.ids) {
      const role = roleById.get(id);
      const channel = channelById.get(id);
      if (role) targets.push({ kind: "role", name: role.name });
      else if (channel) {
        targets.push({
          kind: "channel",
          name: channel.name,
          channelType: channel.type,
          parent: parentName(channel),
        });
      } else unresolved.push(`${key} (${id})`);
    }
    if (targets.length) map[key] = { format: parsed.format, targets };
  }

  fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`✔ Wrote ${Object.keys(map).length} entries to ${mapPath}`);
  if (unresolved.length) {
    console.log(`\n⚠ Not found in this server (skipped):\n  ${unresolved.join("\n  ")}`);
  }
}

function findRole(roles, target) {
  return roles.filter((r) => r.name === target.name);
}

function findChannel(channels, parentName, target) {
  const sameName = channels.filter(
    (c) => c.name === target.name && c.type === target.channelType,
  );
  const sameParent = sameName.filter((c) => parentName(c) === target.parent);
  return sameParent.length ? sameParent : sameName;
}

function setEnvLine(raw, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(raw)) return raw.replace(pattern, line);
  return `${raw.replace(/\n?$/, "\n")}${line}\n`;
}

async function fillEnv() {
  if (!fs.existsSync(mapPath)) {
    fail(`Missing ${mapPath}. Ask a maintainer to run --export-map.`);
  }
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  let { raw, values } = readEnv();
  const { roles, channels, parentName } = await fetchGuild(values);

  let filled = 0;
  const missing = [];
  const ambiguous = [];
  for (const [key, { format, targets }] of Object.entries(map)) {
    const ids = [];
    for (const target of targets) {
      const matches =
        target.kind === "role"
          ? findRole(roles, target)
          : findChannel(channels, parentName, target);
      if (matches.length === 0) {
        missing.push(`${key} → ${target.kind} "${target.name}"`);
        continue;
      }
      if (matches.length > 1) ambiguous.push(`${key} → "${target.name}"`);
      ids.push(matches[0].id);
    }
    if (ids.length === 0) continue;
    raw = setEnvLine(raw, key, formatIds(format, ids));
    filled += 1;
  }

  fs.writeFileSync(envPath, raw);
  console.log(`✔ Filled ${filled} role/channel IDs in .env`);
  if (ambiguous.length) {
    console.log(`\n⚠ Several matches, used the first:\n  ${ambiguous.join("\n  ")}`);
  }
  if (missing.length) {
    console.log(`\n⚠ Not found in your server (left unchanged):\n  ${missing.join("\n  ")}`);
  }
  console.log(
    "\nIf the bot has already started once with this database, apply the new IDs with:\n" +
      "  node apps/bot/scripts/seed-guild-config.js --force\n",
  );
}

const run = process.argv.includes("--export-map") ? exportMap : fillEnv;
run().catch((err) => fail(err.stack ?? String(err)));
