const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
require("../loadEnv");


// CONFIG
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL;
const IMAGE_PATH = path.join(__dirname, "../assets/welcome.png");

// Avatar placement (tuned for your image)
const AVATAR_SIZE = 360;
const AVATAR_X = 600; // center of 1000px canvas
const AVATAR_Y = 225; // above "Welcome" text

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
      const channel = await client.channels.fetch(
        WELCOME_CHANNEL_ID
      );
      if (!channel || !channel.isTextBased()) return;

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
        AVATAR_X,
        AVATAR_Y,
        AVATAR_SIZE / 2,
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        avatar,
        AVATAR_X - AVATAR_SIZE / 2,
        AVATAR_Y - AVATAR_SIZE / 2,
        AVATAR_SIZE,
        AVATAR_SIZE
      );
      ctx.restore();

      // Optional soft outline
      ctx.beginPath();
      ctx.arc(
        AVATAR_X,
        AVATAR_Y,
        AVATAR_SIZE / 2,
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


      const welcomeEmbed = new EmbedBuilder()
  .setTitle("Welcome to r/alevel 👋")
  .setDescription(
    `<@${member.id}> has joined the community!\n\n` +
    `Select/edit your subject roles from **Channels & Roles** ` +
    `to access subject channels and resources!`
  )
  .setImage("attachment://welcome.png")
  .setColor("#2CDAF2");

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