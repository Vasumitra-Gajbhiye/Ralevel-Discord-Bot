const TIME_UTC_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Combine a YYYY-MM-DD date with an HH:mm UTC time into a Date.
 * @param {string} dateStr
 * @param {string} timeUtc
 * @returns {Date}
 */
function combineDateAndUtcTime(dateStr, timeUtc) {
  if (!DATE_RE.test(dateStr)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  if (!TIME_UTC_RE.test(timeUtc)) {
    throw new Error("time must be HH:mm UTC");
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeUtc.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

/**
 * Compute lockAt / unlockAt for a paper from its session windows.
 * @param {{ amStartUtc: string, amEndUtc: string, pmStartUtc: string, pmEndUtc: string }} session
 * @param {{ date: string, slot: "AM" | "PM" }} paper
 * @returns {{ lockAt: Date, unlockAt: Date }}
 */
function computePaperWindow(session, paper) {
  const startUtc =
    paper.slot === "AM" ? session.amStartUtc : session.pmStartUtc;
  const endUtc = paper.slot === "AM" ? session.amEndUtc : session.pmEndUtc;

  const lockAt = combineDateAndUtcTime(paper.date, startUtc);
  const unlockAt = combineDateAndUtcTime(paper.date, endUtc);

  if (!(unlockAt.getTime() > lockAt.getTime())) {
    throw new Error(
      `${paper.slot} end time must be after ${paper.slot} start time`,
    );
  }

  return { lockAt, unlockAt };
}

module.exports = {
  TIME_UTC_RE,
  DATE_RE,
  combineDateAndUtcTime,
  computePaperWindow,
};
