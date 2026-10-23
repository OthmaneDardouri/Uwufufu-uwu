// Client for the optional server. Every call fails soft: without a server the site
// still works with the categories shipped in the repo.
import { load, save } from "./storage.js";

let base = "";
let config = {};

export async function initApi() {
  try {
    config = await (await fetch("config.json", { cache: "no-cache" })).json();
  } catch { config = {}; }
  base = (config.apiBase ?? "").replace(/\/$/, "");
}

/** The donation link from config.json, only if it is a plain https URL. */
export function supportUrl() {
  try {
    const u = new URL(config.supportUrl ?? "");
    return u.protocol === "https:" ? u.href : "";
  } catch { return ""; }
}

async function request(path, { method = "GET", body, admin = false, timeout = 8000 } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (admin) headers.authorization = `Bearer ${adminToken()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { status: res.status, details: data?.details });
    return data;
  } finally {
    clearTimeout(t);
  }
}

/** { ok, admin, ai } or null when no server is reachable (e.g. static hosting). */
export async function health() {
  try { return await request("/api/health", { timeout: 3000 }); } catch { return null; }
}

export async function serverCategories() {
  try { return (await request("/api/categories")).categories ?? []; } catch { return []; }
}

export async function serverThemes() {
  try { return (await request("/api/themes")).themes ?? []; } catch { return []; }
}

export const adminToken = () => load("adminToken", "");
export const setAdminToken = (t) => save("adminToken", t || undefined);
export const checkAdmin = () => request("/api/admin/check", { method: "POST", admin: true });
export const generateCategory = (prompt, count) =>
  request("/api/admin/generate", { method: "POST", admin: true, body: { prompt, count }, timeout: 180_000 }).then((r) => r.category);
export const saveCategory = (category) =>
  request(`/api/admin/categories/${category.id}`, { method: "PUT", admin: true, body: { category } }).then((r) => r.category);
export const deleteCategory = (id) => request(`/api/admin/categories/${id}`, { method: "DELETE", admin: true });

/** Style transfer: any of image (data URL), prompt, base theme → `count` theme variants. */
export const generateThemes = ({ image, prompt, base, count }) =>
  request("/api/admin/generate-themes", { method: "POST", admin: true, body: { image, prompt, base, count }, timeout: 180_000 }).then((r) => r.themes);
export const saveTheme = (theme) =>
  request(`/api/admin/themes/${theme.id}`, { method: "PUT", admin: true, body: { theme } }).then((r) => r.theme);
export const deleteTheme = (id) => request(`/api/admin/themes/${id}`, { method: "DELETE", admin: true });
