const { CertRotation, Certificate } = require("@ralevel/db");
const { getISTDateInfo } = require("./qotdHelpers");
const { tryGetGuildConfig, getRoleId } = require("./guildConfigStore");

function getCertificatesHourIst() {
  const cfg = tryGetGuildConfig();
  return cfg?.schedules?.certificatesHourIst ?? 6;
}

function getISTDateStrFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const istTime = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
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
  getCertificatesHourIst,
  getISTDateStrFromDate,
  istCalendarAgeDays,
  claimNextCertAssignee,
  findCertRotation,
  shouldSendAdminRoleReminder,
  getISTDateInfo,
  getRoleId,
  Certificate,
  CertRotation,
};
