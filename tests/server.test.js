import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.mjs";
import { createStore } from "../server/store.mjs";
import { toCategory, toTheme, categoryRequestText, parseImage } from "../server/claude.mjs";
import { readFileSync } from "node:fs";

const TOKEN = "test-token-1234567890";
let server, base, dir;
const builtIn = JSON.parse(readFileSync(new URL("../themes/index.json", import.meta.url))).themes[0];

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "nb-"));
  const stores = { categories: await createStore(dir, "categories"), themes: await createStore(dir, "themes") };
  const config = {
    publicDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    adminToken: TOKEN, anthropicKey: "fake", model: "m", allowedOrigins: ["https://example.github.io"],
  };
  // fake Claude: deterministic answers shaped like the real tool calls
  const ai = {
    generateCategory: async ({ prompt, count }) => toCategory({
      id: "Test Cat", name_it: prompt, name_en: prompt,
      items: Array.from({ length: count }, (_, i) => ({ name: `X${i}`, wiki: `X${i}` })),
    }),
    themeFromImage: async () => toTheme({ ...builtIn, id: "From Image", name_it: "Da immagine", name_en: "From image" }),
  };
  server = http.createServer(createApp({ stores, config, ai }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });

test("serves the site but never private files", async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/data/pokemon.json`)).status, 200);
  for (const p of ["/server/app.mjs", "/package.json", "/.git/config", "/src/../server/app.mjs", "/%2e%2e/etc/passwd"]) {
    assert.equal((await fetch(`${base}${p}`)).status, 404, p);
  }
});

test("health reports features without secrets", async () => {
  const body = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(body, { ok: true, admin: true, ai: true });
});

test("admin routes reject missing or wrong tokens", async () => {
  assert.equal((await fetch(`${base}/api/admin/check`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/check`, { method: "POST", headers: auth("nope") })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/check`, { method: "POST", headers: auth() })).status, 200);
});

test("generate → save → list → delete", async () => {
  const gen = await fetch(`${base}/api/admin/generate`, { method: "POST", headers: auth(), body: JSON.stringify({ prompt: "Boss Souls", count: 8 }) });
  const { category } = await gen.json();
  assert.equal(category.id, "ai-test-cat");
  assert.equal(category.items.length, 8);

  const put = await fetch(`${base}/api/admin/categories/${category.id}`, { method: "PUT", headers: auth(), body: JSON.stringify({ category }) });
  assert.equal(put.status, 200);

  const list = await (await fetch(`${base}/api/categories`)).json();
  assert.equal(list.categories.length, 1);
  assert.equal(list.categories[0].name.it, "Boss Souls");

  const del = await fetch(`${base}/api/admin/categories/${category.id}`, { method: "DELETE", headers: auth() });
  assert.equal(del.status, 204);
  assert.equal((await (await fetch(`${base}/api/categories`)).json()).categories.length, 0);
});

test("invalid categories are rejected with details", async () => {
  const bad = { id: "bad", name: "x", items: [{ name: "only one" }] };
  const res = await fetch(`${base}/api/admin/categories/bad`, { method: "PUT", headers: auth(), body: JSON.stringify({ category: bad }) });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).details.length > 0);
});

test("CORS only for allowed origins", async () => {
  const ok = await fetch(`${base}/api/health`, { headers: { origin: "https://example.github.io" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://example.github.io");
  const no = await fetch(`${base}/api/health`, { headers: { origin: "https://evil.example" } });
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

test("style transfer: image -> theme draft -> publish -> public list", async () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const res = await fetch(`${base}/api/admin/theme-from-image`, { method: "POST", headers: auth(), body: JSON.stringify({ image: png }) });
  const { theme, warnings } = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(warnings, []);
  assert.equal(theme.id, "ai-from-image");
  const put = await fetch(`${base}/api/admin/themes/${theme.id}`, { method: "PUT", headers: auth(), body: JSON.stringify({ theme }) });
  assert.equal(put.status, 200);
  assert.equal((await (await fetch(`${base}/api/themes`)).json()).themes[0].id, "ai-from-image");
});

test("themes with injected CSS or bad values are rejected", async () => {
  const evil = { ...builtIn, id: "evil", colors: { ...builtIn.colors, bg: "red;} body{display:none" } };
  const res = await fetch(`${base}/api/admin/themes/evil`, { method: "PUT", headers: auth(), body: JSON.stringify({ theme: evil }) });
  assert.equal(res.status, 422);
  const noImage = await fetch(`${base}/api/admin/theme-from-image`, { method: "POST", headers: auth(), body: JSON.stringify({ image: "http://x" }) });
  assert.equal(noImage.status, 400);
});

test("helpers", () => {
  assert.match(categoryRequestText("x", 16), /16/);
  assert.deepEqual(parseImage("data:image/jpeg;base64,AAAA"), { media_type: "image/jpeg", data: "AAAA" });
  assert.equal(parseImage("data:text/html;base64,AAAA"), null);
});
