// Minimal rendering helpers. Views return HTML strings built with `html`, which escapes
// every interpolated value unless it was produced by `html` itself (or wrapped in `raw`).
import { imageFor } from "../services/images.js";
import { generatedArt } from "../core/art.js";

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
const render = (v) => (v == null || v === false ? "" : Array.isArray(v) ? v.map(render).join("") : v instanceof Safe ? v.s : escape(v));

export function html(strings, ...values) {
  return new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ""), ""));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// --- pictures --------------------------------------------------------------
// `picture(item)` renders a placeholder; `hydratePictures(root)` swaps in the real image
// once its URL is known. Items without a picture keep a styled monogram.
const registry = new Map();
let seq = 0;

const monogram = (name) => name.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function picture(item, cls = "") {
  const id = `p${++seq}`;
  registry.set(id, item);
  return html`<div class="pic ${cls}" data-pic="${id}"><span class="pic-mono">${monogram(item?.name ?? "?")}</span></div>`;
}

export function hydratePictures(root) {
  for (const el of $$("[data-pic]", root)) {
    const item = registry.get(el.dataset.pic);
    registry.delete(el.dataset.pic);
    // a generated picture shows at once; the real one replaces it as soon as it has loaded
    const placeholder = generatedArt(item?.name ?? "?");
    const img = new Image();
    img.alt = item?.name ?? "";
    img.decoding = "async";
    img.src = placeholder;
    img.onload = () => el.classList.add("pic-ready");
    el.append(img);
    imageFor(item).then((url) => {
      if (!url || url === placeholder) return;
      const real = new Image();
      real.onload = () => { img.src = url; el.classList.add("pic-real"); };
      real.src = url; // broken remote picture: we simply keep the generated one
    });
  }
}

export function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add("toast-out"), 3200);
  setTimeout(() => el.remove(), 3800);
}
