const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const REGULATIONS_URL =
  "https://ralevel.com/legal/discord-regulations";
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_PATH = path.join(__dirname, "..", "data", "rules-cache.json");
const USER_AGENT = "ralevel-discord-bot/1.0 (+https://ralevel.com)";

/** @type {RegulationsCache | null} */
let cache = null;

/**
 * @typedef {{ title: string, ruleIds: string[] }} Section
 * @typedef {{ id: string, section: string, title: string, body: string }} Rule
 * @typedef {{
 *   source: string,
 *   fetchedAt: string,
 *   lastUpdatedLabel: string | null,
 *   sections: Record<string, Section>,
 *   rules: Record<string, Rule>,
 * }} RegulationsCache
 */

function ensureDataDir() {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {string} html
 * @returns {RegulationsCache}
 */
function parseRegulations(html) {
  const $ = cheerio.load(html);
  /** @type {Record<string, Section>} */
  const sections = {};
  /** @type {Record<string, Rule>} */
  const rules = {};

  let lastUpdatedLabel = null;
  const updatedText = $("h1")
    .first()
    .next("p")
    .text()
    .trim();
  const updatedMatch = updatedText.match(/Last updated:\s*(.+)$/i);
  if (updatedMatch) {
    lastUpdatedLabel = updatedMatch[1].trim();
  } else {
    // Fallback: any short element containing the label
    $("p").each((_, el) => {
      if (lastUpdatedLabel) return;
      const t = $(el).text().trim();
      const m = t.match(/^Last updated:\s*(.+)$/i);
      if (m && m[1].length < 60) lastUpdatedLabel = m[1].trim();
    });
  }

  $("section[id^='section']").each((_, sectionEl) => {
    const $section = $(sectionEl);
    const sectionIdAttr = $section.attr("id") || "";
    const sectionNumMatch = sectionIdAttr.match(/^section(\d+)$/i);
    if (!sectionNumMatch) return;

    const sectionNum = sectionNumMatch[1];
    const h2Text = $section.find("h2").first().text().trim();
    const titleMatch = h2Text.match(/^Section\s+\d+\s*[—–-]\s*(.+)$/i);
    const sectionTitle = titleMatch ? titleMatch[1].trim() : h2Text;

    const ruleIds = [];

    $section.find("h3").each((__, h3El) => {
      const $h3 = $(h3El);
      const heading = $h3.text().trim();
      const ruleMatch = heading.match(/^(\d+\.\d+)\s+(.+)$/);
      if (!ruleMatch) return;

      const id = ruleMatch[1];
      const title = ruleMatch[2].trim();
      const $body = $h3.next("p");
      const body = $body.text().trim();
      if (!body) return;

      rules[id] = {
        id,
        section: sectionNum,
        title,
        body,
      };
      ruleIds.push(id);
    });

    if (ruleIds.length > 0) {
      sections[sectionNum] = {
        title: sectionTitle,
        ruleIds,
      };
    }
  });

  return {
    source: REGULATIONS_URL,
    fetchedAt: new Date().toISOString(),
    lastUpdatedLabel,
    sections,
    rules,
  };
}

/**
 * @returns {Promise<string>}
 */
async function fetchRegulationsHtml() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(REGULATIONS_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {RegulationsCache} data
 */
function writeDiskCache(data) {
  ensureDataDir();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @returns {RegulationsCache | null}
 */
function loadDiskCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data?.rules || Object.keys(data.rules).length === 0) return null;
    return data;
  } catch (err) {
    console.warn("[rules] Failed to load disk cache:", err.message);
    return null;
  }
}

/**
 * @returns {Promise<boolean>} true if sync succeeded
 */
async function syncRules() {
  try {
    const html = await fetchRegulationsHtml();
    const parsed = parseRegulations(html);
    const ruleCount = Object.keys(parsed.rules).length;

    if (ruleCount === 0) {
      throw new Error("Parsed 0 rules — HTML structure may have changed");
    }

    cache = parsed;
    writeDiskCache(parsed);
    console.log(
      `[rules] synced ${ruleCount} rules across ${Object.keys(parsed.sections).length} sections`,
    );
    return true;
  } catch (err) {
    console.error("[rules] Sync failed:", err.message || err);

    if (!cache) {
      const disk = loadDiskCache();
      if (disk) {
        cache = disk;
        console.warn(
          `[rules] Using disk cache from ${disk.fetchedAt} (${Object.keys(disk.rules).length} rules)`,
        );
      } else {
        console.error("[rules] No in-memory or disk cache available");
      }
    } else {
      console.warn(
        `[rules] Keeping last-good cache from ${cache.fetchedAt} (${Object.keys(cache.rules).length} rules)`,
      );
    }

    return false;
  }
}

/**
 * Normalize user input: "1.1." / " 1.1 " → "1.1", "1" → "1"
 * @param {string} raw
 * @returns {string}
 */
function normalizeRuleId(raw) {
  return String(raw || "")
    .trim()
    .replace(/\.+$/, "");
}

/**
 * @param {string} id
 * @returns {Rule | null}
 */
function getRule(id) {
  if (!cache) return null;
  const key = normalizeRuleId(id);
  return cache.rules[key] ?? null;
}

/**
 * @param {string} n
 * @returns {(Section & { id: string }) | null}
 */
function getSection(n) {
  if (!cache) return null;
  const key = normalizeRuleId(n);
  const section = cache.sections[key];
  if (!section) return null;
  return { id: key, ...section };
}

/**
 * @returns {string[]}
 */
function listRuleIds() {
  if (!cache) return [];
  return Object.keys(cache.rules).sort((a, b) => {
    const [aMaj, aMin] = a.split(".").map(Number);
    const [bMaj, bMin] = b.split(".").map(Number);
    return aMaj - bMaj || aMin - bMin;
  });
}

/**
 * @returns {{ source: string, fetchedAt: string | null, lastUpdatedLabel: string | null, ruleCount: number } | null}
 */
function getMeta() {
  if (!cache) return null;
  return {
    source: cache.source,
    fetchedAt: cache.fetchedAt,
    lastUpdatedLabel: cache.lastUpdatedLabel,
    ruleCount: Object.keys(cache.rules).length,
  };
}

/**
 * @returns {boolean}
 */
function hasCache() {
  return cache !== null && Object.keys(cache.rules).length > 0;
}

/**
 * Autocomplete suggestions for a typed prefix.
 * @param {string} focused
 * @param {number} [limit=25]
 * @returns {{ name: string, value: string }[]}
 */
function autocompleteRules(focused, limit = 25) {
  if (!cache) return [];

  const q = String(focused || "").trim().toLowerCase();
  const sectionEntries = Object.entries(cache.sections).map(([id, s]) => ({
    name: `Section ${id} — ${s.title}`.slice(0, 100),
    value: id,
  }));
  const ruleEntries = listRuleIds().map((id) => {
    const rule = cache.rules[id];
    return {
      name: `${id} ${rule.title}`.slice(0, 100),
      value: id,
    };
  });

  const all = [...sectionEntries, ...ruleEntries];
  const filtered = q
    ? all.filter(
        (e) =>
          e.value.toLowerCase().startsWith(q) ||
          e.name.toLowerCase().includes(q),
      )
    : all;

  return filtered.slice(0, limit);
}

/**
 * @param {import('discord.js').Client} client
 */
function ruleSyncSystem(client) {
  // Load disk cache immediately so /rule works before first network sync.
  const disk = loadDiskCache();
  if (disk) {
    cache = disk;
    console.log(
      `[rules] Loaded disk cache (${Object.keys(disk.rules).length} rules from ${disk.fetchedAt})`,
    );
  }

  client.once("ready", () => {
    console.log("[rules] Scheduler started (sync every 12 hours).");
    syncRules();
    setInterval(syncRules, SYNC_INTERVAL_MS);
  });
}

module.exports = ruleSyncSystem;
module.exports.syncRules = syncRules;
module.exports.parseRegulations = parseRegulations;
module.exports.getRule = getRule;
module.exports.getSection = getSection;
module.exports.listRuleIds = listRuleIds;
module.exports.getMeta = getMeta;
module.exports.hasCache = hasCache;
module.exports.normalizeRuleId = normalizeRuleId;
module.exports.autocompleteRules = autocompleteRules;
module.exports.REGULATIONS_URL = REGULATIONS_URL;
