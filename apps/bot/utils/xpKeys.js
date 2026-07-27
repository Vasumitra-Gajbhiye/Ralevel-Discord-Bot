const PENDING_KEY_TTL_SEC = 60 * 60 * 24 * 7;
const FLUSH_LOCK_TTL_SEC = 120;

function getPendingKey(guildId) {
  return `xp:pending:${guildId}`;
}

function getBoosterKey(guildId) {
  return `xp:boosters:${guildId}`;
}

function getDrainingKey(guildId, flushId) {
  return `xp:draining:${guildId}:${flushId}`;
}

function getDrainingBoostersKey(guildId, flushId) {
  return `xp:draining-boosters:${guildId}:${flushId}`;
}

function getFlushLockKey(guildId) {
  return `xp:flush:lock:${guildId}`;
}

module.exports = {
  PENDING_KEY_TTL_SEC,
  FLUSH_LOCK_TTL_SEC,
  getPendingKey,
  getBoosterKey,
  getDrainingKey,
  getDrainingBoostersKey,
  getFlushLockKey,
};
