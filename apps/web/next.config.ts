import type { NextConfig } from "next";
import path from "path";
import { config as loadDotenv } from "dotenv";

// Load repo-root .env so MONGO_URI is shared with the bot in local dev.
loadDotenv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@ralevel/db", "@ralevel/shared"],
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;
