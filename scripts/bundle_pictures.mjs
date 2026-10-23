#!/usr/bin/env node
// For the static copy on GitHub Pages, which has no server to fetch pictures through:
// downloads the pictures from hosts that refuse to be shown on other sites (Fandom) into
// <site>/pictures/ and points <site>/data/pictures.json at the copies. The repo itself keeps
// only links; the copies exist only in the published site.
//
//   node scripts/bundle_pictures.mjs _site
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { UA } from "../server/images.mjs";

const site = process.argv[2];
if (!site) { console.error("usage: bundle_pictures.mjs <site dir>"); process.exit(1); }
const SERVER_ONLY = /^https:\/\/static\.wikia\.nocookie\.net\//;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 3 * 1024 * 1024;

const file = path.join(site, "data/pictures.json");
const data = JSON.parse(await readFile(file, "utf8"));
await mkdir(path.join(site, "pictures"), { recursive: true });

const todo = Object.entries(data.pictures).filter(([, url]) => SERVER_ONLY.test(url));
let copied = 0, failed = 0;
async function worker() {
  for (let next = todo.shift(); next; next = todo.shift()) {
    const [key, url] = next;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
      const ext = EXT[(res.headers.get("content-type") ?? "").split(";")[0]];
      if (!res.ok || !ext) throw new Error(`${res.status} ${res.headers.get("content-type")}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > MAX_BYTES) throw new Error("too large");
      const name = `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.${ext}`;
      await writeFile(path.join(site, "pictures", name), body);
      data.pictures[key] = `pictures/${name}`;
      copied++;
    } catch (err) {
      failed++;
      console.warn(`not copied: ${key} (${err.message})`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
await writeFile(file, JSON.stringify(data));
console.log(`copied ${copied} pictures, ${failed} failed`);
