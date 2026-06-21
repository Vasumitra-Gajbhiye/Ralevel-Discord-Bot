const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testHandlerUsesCachedBackground() {
  const welcomePath = path.join(__dirname, "../systems/welcome.js");
  const source = fs.readFileSync(welcomePath, "utf8");

  const handlerStart = source.indexOf('client.on("guildMemberAdd"');
  assert(handlerStart !== -1, "welcome.js must register guildMemberAdd handler");

  const handlerBody = source.slice(handlerStart);
  assert(
    handlerBody.includes("getBackground()"),
    "guildMemberAdd handler must use getBackground()"
  );
  assert(
    !handlerBody.includes("loadImage(IMAGE_PATH)"),
    "guildMemberAdd handler must not call loadImage(IMAGE_PATH) directly"
  );
}

function testHandlerStillLoadsAvatar() {
  const source = fs.readFileSync(
    path.join(__dirname, "../systems/welcome.js"),
    "utf8"
  );

  assert(
    source.includes("loadImage(avatarURL)"),
    "welcome.js must still load avatar per join via loadImage(avatarURL)"
  );
}

function loadWelcomeWithMockCanvas() {
  const canvasPath = require.resolve("@napi-rs/canvas");
  const welcomePath = require.resolve("../systems/welcome.js");

  let loadImageCalls = 0;
  const mockImage = { width: 1200, height: 675 };

  require.cache[canvasPath] = {
    id: canvasPath,
    filename: canvasPath,
    loaded: true,
    exports: {
      loadImage: async () => {
        loadImageCalls += 1;
        return mockImage;
      },
      createCanvas: () => ({
        getContext: () => ({}),
      }),
    },
  };

  delete require.cache[welcomePath];
  const welcome = require("../systems/welcome");

  return {
    welcome,
    getLoadImageCalls: () => loadImageCalls,
  };
}

async function testBackgroundCacheBehavior() {
  const { welcome, getLoadImageCalls } = loadWelcomeWithMockCanvas();

  welcome.resetBackgroundCache();

  const first = await welcome.getBackground();
  assert(first, "first getBackground call should return an image");
  assert(getLoadImageCalls() === 1, "first getBackground call should load image once");

  const second = await welcome.getBackground();
  assert(second === first, "cached getBackground call should return same image");
  assert(
    getLoadImageCalls() === 1,
    "cached getBackground call should not load image again"
  );

  welcome.resetBackgroundCache();
  await welcome.getBackground();
  assert(
    getLoadImageCalls() === 2,
    "resetBackgroundCache should allow a fresh load on next call"
  );
}

async function main() {
  testHandlerUsesCachedBackground();
  testHandlerStillLoadsAvatar();
  await testBackgroundCacheBehavior();

  console.log("verify-welcome: all checks passed");
}

main().catch((err) => {
  console.error("verify-welcome failed:", err.message);
  process.exit(1);
});
