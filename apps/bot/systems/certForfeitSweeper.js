const { EmbedBuilder } = require("discord.js");
const {
  getCertificatesForfeitHourIst,
  getISTDateInfo,
  findCertRotation,
  clearForfeitSchedule,
  FORFEIT_ELIGIBLE_STATUSES,
  Certificate,
  CertRotation,
} = require("../utils/certHelpers");
const {
  getChannelId,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");
const { updateStoredReviewMessage } = require("../utils/certReviewEmbed");

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function notifyApplicant(client, app, embed) {
  try {
    const user = await client.users.fetch(app.userId);
    await user.send({ embeds: [embed] });
  } catch {
    try {
      const updatesCh = await client.channels
        .fetch(getChannelId("certUpdates"))
        .catch(() => null);
      if (!updatesCh?.isTextBased?.()) return;

      const updateEmbed = EmbedBuilder.from(embed).setFooter({
        text: "You're seeing updates here because your DMs are closed or restricted.",
      });

      await updatesCh.send({
        content: `<@${app.userId}>`,
        embeds: [updateEmbed],
      });
    } catch (err) {
      console.error(`[CertForfeit] Failed to notify user for ${app._id}:`, err);
    }
  }
}

module.exports = function certForfeitSweeperSystem(client) {
  async function processDueForfeits() {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.certificates === false) return;

      if (!client.isReady()) {
        console.log("[CertForfeit] Skip: Discord client not ready yet.");
        return;
      }

      const guildId = process.env.GUILD_ID;
      if (!guildId) {
        console.warn("[CertForfeit] Skip: GUILD_ID is not set.");
        return;
      }

      const { dateStr, hour } = getISTDateInfo();
      const forfeitHour = getCertificatesForfeitHourIst();

      if (hour < forfeitHour) {
        console.log(
          `[CertForfeit] Skip: before ${forfeitHour}:00 IST (currently ${hour}:xx on ${dateStr}).`,
        );
        return;
      }

      let rotation = await findCertRotation(guildId);
      if (rotation?.lastForfeitDate === dateStr) {
        console.log(`[CertForfeit] Skip: already ran today (${dateStr}).`);
        return;
      }

      const now = new Date();
      const dueApps = await Certificate.find({
        forfeitAt: { $ne: null, $lte: now },
        status: { $in: FORFEIT_ELIGIBLE_STATUSES },
      });

      console.log(
        `[CertForfeit] ${dateStr} | processing ${dueApps.length} due forfeit(s)`,
      );

      for (const app of dueApps) {
        try {
          const reason = (app.forfeitReason || "").trim() || "No reason provided";
          const moderatorId = app.forfeitModeratorId || null;

          app.status = "forfeited";
          app.reason = reason;
          app.moderatorId = moderatorId;
          app.resolvedAt = now;
          clearForfeitSchedule(app);
          await app.save();

          await updateStoredReviewMessage(
            client,
            app,
            "forfeited",
            moderatorId ? `<@${moderatorId}>` : "System",
            reason,
          );

          const dmEmbed = new EmbedBuilder()
            .setTitle("Certificate Application — Forfeited")
            .setDescription(
              `Your application for **${app.type}** has been **forfeited**.`,
            )
            .addFields(
              { name: "Reason", value: reason.slice(0, 1024) },
              {
                name: "Application ID",
                value: `\`${app._id}\``,
                inline: true,
              },
            )
            .setColor("#ff4d4d")
            .setTimestamp();

          await notifyApplicant(client, app, dmEmbed);

          try {
            const reviewCh = await client.channels
              .fetch(getChannelId("review"))
              .catch(() => null);
            if (reviewCh?.isTextBased?.()) {
              await reviewCh.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("Certificate Application Forfeited")
                    .setDescription(
                      `Application \`${app._id}\` for **${app.userTag}** was automatically forfeited.`,
                    )
                    .addFields(
                      { name: "Reason", value: reason.slice(0, 1024) },
                      {
                        name: "Type",
                        value: String(app.type),
                        inline: true,
                      },
                    )
                    .setColor("#ff4d4d")
                    .setTimestamp(),
                ],
              });
            }
          } catch (err) {
            console.error(
              `[CertForfeit] Review log failed for ${app._id}:`,
              err,
            );
          }
        } catch (err) {
          console.error(`[CertForfeit] Failed for app ${app._id}:`, err);
        }
      }

      if (rotation) {
        rotation.lastForfeitDate = dateStr;
        await rotation.save();
      } else {
        await CertRotation.findOneAndUpdate(
          { guildId },
          {
            $set: { lastForfeitDate: dateStr },
            $setOnInsert: {
              guildId,
              assignees: [],
              currentIndex: 0,
              enabled: true,
            },
          },
          { upsert: true },
        );
      }
    } catch (err) {
      console.error("[CertForfeit] error:", err);
    }
  }

  client.once("ready", () => {
    console.log(
      "[CertForfeit] Scheduler started (checks every 5 minutes after client ready).",
    );
    setInterval(processDueForfeits, CHECK_INTERVAL_MS);
    setTimeout(processDueForfeits, 20_000);
  });
};
