#!/usr/bin/env node
// Entry point: read configuration from the environment and start the server.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
import { createStore } from "./store.mjs";
import { createImageResolver } from "./images.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

const config = {
  port: parseInt(env.PORT ?? "8080", 10),
  host: env.HOST ?? "0.0.0.0",
  publicDir: env.PUBLIC_DIR ?? root,
  dataDir: env.DATA_DIR ?? path.join(root, "storage"),
  adminToken: env.ADMIN_TOKEN ?? "",
  anthropicKey: env.ANTHROPIC_API_KEY ?? "",
  model: env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
  // origins allowed to call the API cross-site, e.g. a GitHub Pages copy of the frontend
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
};

if (config.adminToken && config.adminToken.length < 16) {
  console.error("ADMIN_TOKEN must be at least 16 characters. Generate one with: openssl rand -hex 24");
  process.exit(1);
}

const stores = {
  categories: await createStore(config.dataDir, "categories"),
  themes: await createStore(config.dataDir, "themes"),
};
const images = await createImageResolver({ dir: config.dataDir });
const server = http.createServer(createApp({ stores, config, images }));
server.listen(config.port, config.host, () => {
  console.log(`Neon Bracket on http://localhost:${config.port}`);
  console.log(`admin: ${config.adminToken ? "on" : "off (set ADMIN_TOKEN)"} · AI: ${config.anthropicKey ? config.model : "off (set ANTHROPIC_API_KEY)"}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(async () => { await images.flush(); process.exit(0); }));
