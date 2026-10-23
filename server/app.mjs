// HTTP handler: static site + JSON API. Built on node:http only, no framework needed.
//
// Public:  GET  /api/health, /api/categories, /api/themes
//          GET  /api/image?name=&char=&title=&fandom=&wiki=[&debug=1]   (find a picture, cached)
//          GET  /api/img?u=<picture url>                                (same-origin proxy for found pictures)
// Admin:   POST /api/admin/check
//          POST /api/admin/generate              (Claude: idea -> category draft)
//          POST /api/admin/generate-themes       (Claude: image / description / base theme -> theme variants)
//          PUT|DELETE /api/admin/categories/:id
//          PUT|DELETE /api/admin/themes/:id
// Admin routes need "Authorization: Bearer <ADMIN_TOKEN>".
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { timingSafeEqual, createHash } from "node:crypto";
import path from "node:path";
import { validateCategory } from "../src/core/catalog.js";
import { sanitizeTheme } from "../src/core/theme.js";
import * as claude from "./claude.mjs";
import { parseImageQuery } from "./images.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
// Only these top-level paths are served; everything else (server/, .git, storage...) stays private.
const PUBLIC_ROOTS = new Set(["index.html", "src", "assets", "categories", "themes", "data", "manifest.webmanifest", "sw.js", "config.json"]);
const MAX_BODY = 256 * 1024;
const MAX_IMAGE_BODY = 6 * 1024 * 1024;
const MAX_ITEMS = 256;

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

const sha = (s) => createHash("sha256").update(String(s)).digest();
const sameToken = (a, b) => timingSafeEqual(sha(a), sha(b)); // hashing equalises lengths

/** Tiny fixed-window limiter for failed admin logins, per client IP. */
function failureLimiter({ max = 10, windowMs = 15 * 60_000 } = {}) {
  const hits = new Map();
  return {
    blocked(ip, now = Date.now()) {
      const h = hits.get(ip);
      return !!h && now - h.start < windowMs && h.count >= max;
    },
    fail(ip, now = Date.now()) {
      const h = hits.get(ip);
      if (!h || now - h.start >= windowMs) hits.set(ip, { start: now, count: 1 });
      else h.count++;
    },
  };
}

async function readJson(req, limit = MAX_BODY) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

// What the admin can publish. Each collection validates and whitelists its own fields,
// so the stores never hold arbitrary client data. Add a collection here to publish something new.
const COLLECTIONS = {
  categories: {
    key: "category",
    clean(category) {
      category.group ||= "custom";
      const errors = validateCategory(category);
      if (category.items?.length > MAX_ITEMS) errors.push(`at most ${MAX_ITEMS} items`);
      const { id, group, name, description, cover, source, malAnime, fandom } = category;
      const items = category.items?.map(({ name, sub, info, wiki, pokemon, image, char, anime, title }) => ({ name, sub, info, wiki, pokemon, image, char, anime, title }));
      return { errors, value: { id, group, name, description, cover, items, source, malAnime, fandom } };
    },
  },
  // pictures the admin set by hand for one item (id = imageKey of its lookup)
  "image-overrides": {
    key: "override",
    clean(o) {
      const errors = [];
      let url = "";
      try {
        const u = new URL(o?.url ?? "");
        if (u.protocol !== "https:") errors.push("the picture URL must start with https://");
        url = u.href;
      } catch { errors.push("invalid picture URL"); }
      if (!/^[a-f0-9]{40}$/.test(o?.id ?? "")) errors.push("invalid id");
      return { errors, value: { id: o?.id, url } };
    },
  },
  themes: {
    key: "theme",
    clean(theme) {
      const { theme: value, errors } = sanitizeTheme(theme);
      return { errors, value };
    },
  },
};

// Picture hosts the proxy may fetch from (nothing else: no open proxy, no SSRF).
const IMAGE_HOSTS = ["static.wikia.nocookie.net", "cdn.myanimelist.net", "upload.wikimedia.org"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Simple sliding-window limiter for the public lookup endpoint (fresh lookups only). */
function windowLimiter(max, windowMs) {
  let hits = [];
  return () => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < windowMs);
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}

export function createApp({ stores, config, ai = claude, images = null, fetchImpl = fetch }) {
  const lookupAllowed = windowLimiter(240, 60_000);
  const limiter = failureLimiter();
  const publicDir = path.resolve(config.publicDir);

  function requireAdmin(req) {
    const ip = req.socket.remoteAddress ?? "?";
    if (!config.adminToken) throw new HttpError(503, "Admin features are disabled (ADMIN_TOKEN not set)");
    if (limiter.blocked(ip)) throw new HttpError(429, "Too many failed attempts, try again later");
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !sameToken(token, config.adminToken)) {
      limiter.fail(ip);
      throw new HttpError(401, "Invalid admin token");
    }
  }

  function requireAi() {
    if (!config.anthropicKey) throw new HttpError(503, "ANTHROPIC_API_KEY not set on the server");
  }

  function corsHeaders(req) {
    const origin = req.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin)) return {};
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      vary: "Origin",
    };
  }

  async function api(req, res, url) {
    const cors = corsHeaders(req);
    const reply = (status, body, headers) => send(res, status, body, { ...cors, ...headers });
    if (req.method === "OPTIONS") return reply(204);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /api/health") {
      return reply(200, { ok: true, admin: !!config.adminToken, ai: !!(config.adminToken && config.anthropicKey), images: !!images });
    }
    if (route === "GET /api/image") {
      if (!images) throw new HttpError(503, "image lookup disabled");
      const q = parseImageQuery(url.searchParams);
      if (!q) throw new HttpError(400, "give at least name, char, title or wiki");
      const debug = url.searchParams.get("debug") === "1";
      if (!lookupAllowed()) throw new HttpError(429, "too many lookups, try again in a minute");
      const found = await images.resolve(q, { fresh: debug });
      // known hosts go through our proxy; a picture the admin pasted from elsewhere is used as is
      const viaProxy = found.url && IMAGE_HOSTS.includes(new URL(found.url).hostname);
      const proxied = found.url ? (viaProxy ? `/api/img?${new URLSearchParams({ u: found.url })}` : found.url) : null;
      return reply(200, { url: found.url, proxied, source: found.source, cached: found.cached, key: found.key, ...(debug && { query: q, tried: found.tried }) },
        { "cache-control": found.url ? "public, max-age=3600" : "no-cache" });
    }
    if (route === "GET /api/img") {
      let target;
      try { target = new URL(url.searchParams.get("u") ?? ""); } catch { throw new HttpError(400, "bad url"); }
      if (target.protocol !== "https:" || !IMAGE_HOSTS.includes(target.hostname)) throw new HttpError(400, "host not allowed");
      const upstream = await fetchImpl(target, { headers: { "user-agent": "NeonBracket/1.0" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      const type = upstream?.headers.get("content-type") ?? "";
      if (!upstream?.ok || !type.startsWith("image/")) throw new HttpError(502, "picture unavailable");
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > MAX_IMAGE_BYTES) throw new HttpError(502, "picture too large");
      res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "public, max-age=604800, immutable", ...cors });
      return res.end(body);
    }
    const list = url.pathname.match(/^\/api\/(categories|themes)$/);
    if (list && req.method === "GET") {
      return reply(200, { [list[1]]: stores[list[1]].list() }, { "cache-control": "no-cache" });
    }

    // everything below is admin-only
    if (!url.pathname.startsWith("/api/admin/")) throw new HttpError(404, "Not found");
    requireAdmin(req);

    if (route === "POST /api/admin/check") return reply(200, { ok: true });

    if (route === "POST /api/admin/generate") {
      requireAi();
      const { prompt, count } = await readJson(req);
      if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 500) throw new HttpError(400, "prompt must be 3-500 characters");
      const n = Math.min(Math.max(parseInt(count, 10) || 32, 4), 128);
      const category = await ai.generateCategory({ apiKey: config.anthropicKey, model: config.model, prompt: prompt.trim(), count: n });
      return reply(200, { category });
    }

    if (route === "POST /api/admin/generate-themes") {
      requireAi();
      const body = await readJson(req, MAX_IMAGE_BODY);
      const image = body.image ? claude.parseImage(body.image) : null;
      if (body.image && !image) throw new HttpError(400, "image must be a base64 data URL (png, jpeg, webp or gif)");
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";
      const base = body.base ? sanitizeTheme(body.base).theme : null;
      if (!image && !prompt && !base) throw new HttpError(400, "give an image, a description or a base theme");
      const count = Math.min(Math.max(parseInt(body.count, 10) || 3, 1), 4);
      const drafts = await ai.generateThemes({ apiKey: config.anthropicKey, model: config.model, image, prompt, base, count });
      // the AI's answers get the same checks as anything else
      const themes = drafts.map((d) => {
        const { theme, errors } = sanitizeTheme(d);
        return { ...theme, idea: d.idea, warnings: errors };
      });
      return reply(200, { themes });
    }

    const item = url.pathname.match(/^\/api\/admin\/(categories|themes|image-overrides)\/([a-z0-9-]+)$/);
    if (item) {
      const [, name, id] = item;
      const store = stores[name];
      const spec = COLLECTIONS[name];
      if (req.method === "DELETE") return reply((await store.remove(id)) ? 204 : 404);
      if (req.method === "PUT") {
        const body = (await readJson(req))[spec.key];
        if (body?.id !== id) throw new HttpError(400, "id in body must match the URL");
        const { errors, value } = spec.clean(body);
        if (errors.length) throw new HttpError(422, `Invalid ${spec.key}`, errors);
        return reply(200, { [spec.key]: await store.put(value) });
      }
    }
    throw new HttpError(404, "Not found");
  }

  async function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
    let rel;
    try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html"; } catch { throw new HttpError(400, "Bad path"); }
    const file = path.resolve(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep) || !PUBLIC_ROOTS.has(rel.split("/")[0])) throw new HttpError(404, "Not found");
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new HttpError(404, "Not found");
    const ext = path.extname(file);
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "content-length": info.size,
      // fonts never change; everything else revalidates so updates show up immediately
      "cache-control": ext === ".woff2" ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  }

  return async function handler(req, res) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("x-frame-options", "DENY");
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error(err.detail ? `${err.message}: ${err.detail}` : err);
      const message = err.status ? err.message : "Internal error";
      if (!res.headersSent) send(res, status, { error: message, ...(err.details && { details: err.details }) }, corsHeaders(req));
      else res.end();
    }
  };
}
