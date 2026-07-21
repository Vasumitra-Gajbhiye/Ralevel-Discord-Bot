const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
require("../loadEnv");

const {
  getGuildConfig,
  getChannelId,
  tryGetGuildConfig,
} = require("../utils/guildConfigStore");

const IMAGE_PATH = path.join(__dirname, "../assets/welcome.png");

let cachedBackground;

async function getBackground() {
  if (!cachedBackground) {
    cachedBackground = await loadImage(IMAGE_PATH);
  }
  return cachedBackground;
}

function welcomeSystem(client) {
  client.on("guildMemberAdd", async (member) => {
    try {
      const cfg = tryGetGuildConfig();
      if (cfg?.features?.welcome === false) return;

      const welcomeCfg = getGuildConfig().welcome || {};
      const welcomeChannelId = getChannelId("welcome");
      if (!welcomeChannelId) return;

      const channel = await client.channels.fetch(welcomeChannelId);
      if (!channel || !channel.isTextBased()) return;

      const avatarSize = welcomeCfg.avatarSize ?? 360;
      const avatarX = welcomeCfg.avatarX ?? 600;
      const avatarY = welcomeCfg.avatarY ?? 225;

      // Canvas
      const canvas = createCanvas(1200, 675);
      const ctx = canvas.getContext("2d");

      const background = await getBackground();
      ctx.drawImage(background, 0, 0, 1200, 675);

      // Load avatar
      const avatarURL = member.user.displayAvatarURL({
        extension: "png",
        size: 256,
      });

      const avatar = await loadImage(avatarURL);

      // Draw circular avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX,
        avatarY,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        avatar,
        avatarX - avatarSize / 2,
        avatarY - avatarSize / 2,
        avatarSize,
        avatarSize
      );
      ctx.restore();

      // Optional soft outline
      ctx.beginPath();
      ctx.arc(
        avatarX,
        avatarY,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = "rgba(44, 218, 242, 0.8)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Convert to buffer
      const buffer = canvas.toBuffer("image/png");

      const attachment = new AttachmentBuilder(buffer, {
        name: "welcome.png",
      });

      const description = (
        welcomeCfg.description ||
        `<@{userId}> has joined the community!\n\nSelect/edit your subject roles from **Channels & Roles** to access subject channels and resources!`
      ).replace(/\{userId\}/g, member.id);

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(welcomeCfg.title || "Welcome to r/alevel 👋")
        .setDescription(description)
        .setImage("attachment://welcome.png")
        .setColor(welcomeCfg.color || "#2CDAF2");

      await channel.send({
        embeds: [welcomeEmbed],
        files: [attachment],
        allowedMentions: {
          users: [member.id],
        },
      });
    } catch (err) {
      console.error("Welcome system error:", err);
    }
  });
}

welcomeSystem.getBackground = getBackground;
welcomeSystem.resetBackgroundCache = () => {
  cachedBackground = null;
};

module.exports = welcomeSystem;
