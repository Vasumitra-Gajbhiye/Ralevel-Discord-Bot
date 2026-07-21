const path = require("path");

// Load repo-root .env so apps share one local env file.
// In production (Coolify), vars are injected into the process environment.
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});
