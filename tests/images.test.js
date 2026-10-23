import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createImageResolver, parseImageQuery } from "../server/images.mjs";
import { createApp } from "../server/app.mjs";
import { createStore } from "../server/store.mjs";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers({ "content-type": "application/json" }) });

/** Fake internet: Fandom knows fruits, Jikan knows Kuzan, Wikipedia knows Goku. Records every call. */
function fakeNet({ fandomDown = false } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.host);
    if (u.host.endsWith("fandom.com")) {
      if (fandomDown) throw new Error("ECONNRESET");
      const titles = u.searchParams.get("titles").split("|");
      const pages = {};
      titles.forEach((t, i) => {
        pages[i] = t === "Hie Hie no Mi" ? { title: t, thumbnail: { source: "https://static.wikia.nocookie.net/onepiece/hie.png" } } : { title: t, missing: "" };
      });
      return json({ query: { pages } });
    }
    if (u.host === "api.jikan.moe") {
      return json({ data: u.searchParams.get("q") === "Kuzan" ? [{ name: "Kuzan", images: { jpg: { image_url: "https://cdn.myanimelist.net/kuzan.jpg" } } }] : [] });
    }
    if (u.host === "en.wikipedia.org") {
      return json({ query: { pages: { 1: { title: "Goku", thumbnail: { source: "https://upload.wikimedia.org/goku.png" } } } } });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, calls };
}

const tmp = () => mkdtemp(path.join(os.tmpdir(), "nb-img-"));

test("fandom page first, then MyAnimeList, then Wikipedia", async () => {
  const dir = await tmp();
  const { fetchImpl } = fakeNet();
  const r = await createImageResolver({ dir, fetchImpl });
  assert.equal((await r.resolve({ fandom: "onepiece", title: "Hie Hie no Mi", name: "Hie Hie no Mi", char: "Kuzan" })).source, "fandom");
  assert.equal((await r.resolve({ fandom: "onepiece", title: "Nope", name: "Pika", char: "Kuzan" })).source, "myanimelist");
  assert.equal((await r.resolve({ name: "Goku", wiki: "Goku" })).source, "wikipedia");
  await r.flush();
  await rm(dir, { recursive: true, force: true });
});

test("answers are cached; misses after network errors are not", async () => {
  const dir = await tmp();
  const net = fakeNet({ fandomDown: true });
  const r = await createImageResolver({ dir, fetchImpl: net.fetchImpl });
  const first = await r.resolve({ fandom: "onepiece", title: "Hie Hie no Mi", name: "x" });
  assert.equal(first.url, null);
  assert.ok(first.tried.some((t) => t.error), "debug info shows the failure");
  const before = net.calls.length;
  await r.resolve({ fandom: "onepiece", title: "Hie Hie no Mi", name: "x" });
  assert.ok(net.calls.length > before, "a miss caused by a network error is retried");

  const ok = fakeNet();
  const r2 = await createImageResolver({ dir, fetchImpl: ok.fetchImpl });
  await r2.resolve({ fandom: "onepiece", title: "Hie Hie no Mi", name: "x" });
  const n = ok.calls.length;
  const again = await r2.resolve({ fandom: "onepiece", title: "Hie Hie no Mi", name: "x" });
  assert.equal(again.cached, true);
  assert.equal(ok.calls.length, n, "second time comes from the cache");
  await r.flush(); await r2.flush();
  await rm(dir, { recursive: true, force: true });
});

test("query parsing rejects unsafe wiki names", () => {
  const q = parseImageQuery(new URLSearchParams({ name: "a", fandom: "evil.com/x" }));
  assert.equal(q.fandom, "");
  assert.equal(parseImageQuery(new URLSearchParams({})), null);
});

test("HTTP: /api/image and the picture proxy only for allowed hosts", async () => {
  const dir = await tmp();
  const net = fakeNet();
  const images = await createImageResolver({ dir, fetchImpl: net.fetchImpl });
  const proxyFetch = async (url) => ({ ok: true, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer, url });
  const stores = { categories: await createStore(dir, "categories"), themes: await createStore(dir, "themes") };
  const config = { publicDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), adminToken: "", anthropicKey: "", allowedOrigins: [] };
  const server = http.createServer(createApp({ stores, config, images, fetchImpl: proxyFetch }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const found = await (await fetch(`${base}/api/image?fandom=onepiece&title=Hie%20Hie%20no%20Mi&name=Hie&debug=1`)).json();
  assert.equal(found.source, "fandom");
  assert.match(found.proxied, /^\/api\/img\?u=https%3A%2F%2Fstatic\.wikia/);
  assert.ok(Array.isArray(found.tried));
  const pic = await fetch(`${base}${found.proxied}`);
  assert.equal(pic.status, 200);
  assert.equal(pic.headers.get("content-type"), "image/png");
  assert.equal((await fetch(`${base}/api/img?u=${encodeURIComponent("https://evil.example/x.png")}`)).status, 400);
  assert.equal((await fetch(`${base}/api/img?u=${encodeURIComponent("http://169.254.169.254/")}`)).status, 400);
  server.close();
  await images.flush();
  await rm(dir, { recursive: true, force: true });
});

test("manual pictures win over every source and only the admin can set them", async (t) => {
  const dir = await tmp();
  const net = fakeNet();
  const overrides = await createStore(dir, "image-overrides");
  const images = await createImageResolver({ dir, fetchImpl: net.fetchImpl, overrides });
  const stores = { categories: await createStore(dir, "categories"), themes: await createStore(dir, "themes"), "image-overrides": overrides };
  const config = { publicDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), adminToken: "a-very-long-admin-token", anthropicKey: "", allowedOrigins: [] };
  const server = http.createServer(createApp({ stores, config, images }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => { server.close(); await images.flush(); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = "fandom=onepiece&title=Gomu%20Gomu%20no%20Mi&name=Gomu%20Gomu%20no%20Mi";

  const miss = await (await fetch(`${base}/api/image?${query}`)).json();
  assert.equal(miss.url, null);
  assert.match(miss.key, /^[a-f0-9]{40}$/);

  const body = (url) => JSON.stringify({ override: { id: miss.key, url } });
  const put = (url, token) => fetch(`${base}/api/admin/image-overrides/${miss.key}`, {
    method: "PUT", body: body(url), headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
  });
  assert.equal((await put("https://example.org/gomu.png")).status, 401);
  assert.equal((await put("javascript:alert(1)", config.adminToken)).status, 422);
  assert.equal((await put("https://example.org/gomu.png", config.adminToken)).status, 200);

  const hit = await (await fetch(`${base}/api/image?${query}`)).json();
  assert.equal(hit.source, "manual");
  assert.equal(hit.proxied, "https://example.org/gomu.png", "manual pictures are not proxied");
});
