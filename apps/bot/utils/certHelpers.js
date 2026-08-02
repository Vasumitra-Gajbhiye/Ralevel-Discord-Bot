const { CertRotation, Certificate } = require("@ralevel/db");
const { getISTDateInfo } = require("./qotdHelpers");
const { tryGetGuildConfig, getRoleId } = require("./guildConfigStore");

const FORFEIT_ELIGIBLE_STATUSES = ["approved", "details submitted"];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function getCertificatesHourIst() {
  const cfg = tryGetGuildConfig();
  return cfg?.schedules?.certificatesHourIst ?? 6;
}

function getCertificatesForfeitHourIst() {
  const cfg = tryGetGuildConfig();
  return cfg?.schedules?.certificatesForfeitHourIst ?? 6;
}

function getISTDateStrFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const istTime = new Date(d.getTime() + IST_OFFSET_MS);
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole IST calendar days between two dates (submission day = 0). */
function istCalendarAgeDays(createdAt, now = new Date()) {
  const fromStr = getISTDateStrFromDate(createdAt);
  const toStr = getISTDateStrFromDate(now);
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

/**
 * Deadline = today (IST) + N calendar days, at hourIst:00 IST, as a UTC Date.
 */
function computeForfeitAt(days, hourIst = getCertificatesForfeitHourIst(), now = new Date()) {
  const safeDays = Math.max(1, Math.floor(Number(days) || 3));
  const safeHour = Math.min(23, Math.max(0, Math.floor(Number(hourIst) || 0)));
  const dateStr = getISTDateStrFromDate(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const istAsUtcMs = Date.UTC(y, m - 1, d + safeDays, safeHour, 0, 0);
  return new Date(istAsUtcMs - IST_OFFSET_MS);
}

function formatForfeitDeadlineGmt(date) {
  const d = date instanceof Date ? date : new Date(date);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${formatted} GMT`;
}

/** Clear scheduled forfeit fields. Returns true if a forfeit was pending. */
function clearForfeitSchedule(app) {
  const had = Boolean(app.forfeitAt);
  app.forfeitAt = null;
  app.forfeitReason = "";
  app.forfeitAction = "";
  app.forfeitScheduledAt = null;
  app.forfeitModeratorId = null;
  app.forfeitDays = null;
  return had;
}

/**
 * Atomically claim the next round-robin assignee and advance the index.
 * @returns {{ id: string, tag: string } | null}
 */
async function claimNextCertAssignee(guildId) {
  if (!guildId) return null;

  const rotation = await CertRotation.findOne({ guildId });
  if (!rotation?.enabled || !rotation.assignees?.length) {
    return null;
  }

  let idx = rotation.currentIndex;
  if (
    !Number.isInteger(idx) ||
    idx < 0 ||
    idx >= rotation.assignees.length
  ) {
    idx = 0;
  }

  const assignee = rotation.assignees[idx];
  if (!assignee?.id) return null;

  rotation.currentIndex = (idx + 1) % rotation.assignees.length;
  await rotation.save();

  return { id: assignee.id, tag: assignee.tag || assignee.id };
}

async function findCertRotation(guildId) {
  if (!guildId) return null;
  return CertRotation.findOne({ guildId });
}

function shouldSendAdminRoleReminder(age, lastAdminReminderDay) {
  if (age < 10) return false;
  if (lastAdminReminderDay == null) return true;
  return age - lastAdminReminderDay >= 3;
}

module.exports = {
  FORFEIT_ELIGIBLE_STATUSES,
  getCertificatesHourIst,
  getCertificatesForfeitHourIst,
  getISTDateStrFromDate,
  istCalendarAgeDays,
  computeForfeitAt,
  formatForfeitDeadlineGmt,
  clearForfeitSchedule,
  claimNextCertAssignee,
  findCertRotation,
  shouldSendAdminRoleReminder,
  getISTDateInfo,
  getRoleId,
  Certificate,
  CertRotation,
};
