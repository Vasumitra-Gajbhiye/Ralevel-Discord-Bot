const RELATIVE_PATTERN = /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i;

/**
 * Parse a deadline string into a Date.
 * Supports relative durations (30m, 2h, 1d) or ISO datetime strings.
 * Returns { date, error } where date is null on failure.
 */
function parsePollDeadline(input) {
  if (!input || typeof input !== "string") {
    return { date: null, error: null };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { date: null, error: null };
  }

  const relativeMatch = trimmed.match(RELATIVE_PATTERN);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();

    let ms;
    if (unit.startsWith("m")) {
      ms = amount * 60 * 1000;
    } else if (unit.startsWith("h")) {
      ms = amount * 60 * 60 * 1000;
    } else {
      ms = amount * 24 * 60 * 60 * 1000;
    }

    if (ms <= 0) {
      return { date: null, error: "Deadline must be in the future." };
    }

    return { date: new Date(Date.now() + ms), error: null };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return {
      date: null,
      error:
        'Invalid deadline. Use relative time (e.g. "30m", "2h", "1d") or an ISO datetime.',
    };
  }

  if (parsed.getTime() <= Date.now()) {
    return { date: null, error: "Deadline must be in the future." };
  }

  return { date: parsed, error: null };
}

module.exports = { parsePollDeadline };
