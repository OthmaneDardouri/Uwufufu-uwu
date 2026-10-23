// Draws the result as a 1080×1350 PNG (Instagram portrait) in the current theme's colours.
import { imageFor } from "../services/images.js";

const W = 1080, H = 1350;

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; // PokeAPI and Wikimedia both allow it, so the canvas stays exportable
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fit(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r, dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function fitText(ctx, text, maxWidth, size, font) {
  let s = size;
  do { ctx.font = `${s}px ${font}`; s -= 2; } while (ctx.measureText(text).width > maxWidth && s > 12);
}

export async function renderResultImage({ title, ranking, labels }) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const display = v("--font-display"), body = v("--font-body");
  await Promise.all([document.fonts.load(`40px ${display}`), document.fonts.load(`40px ${body}`)]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, v("--bg")); bg.addColorStop(1, v("--bg2"));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = v("--muted");
  fitText(ctx, title.toUpperCase(), W - 120, 34, body);
  ctx.fillText(title.toUpperCase(), W / 2, 90);

  ctx.fillStyle = v("--accent");
  fitText(ctx, labels.champion, W - 120, 64, display);
  ctx.fillText(labels.champion, W / 2, 175);

  const [champ, ...rest] = ranking;
  const [champImg, ...podiumImgs] = await Promise.all(ranking.slice(0, 4).map((e) => imageFor(e).then(loadImage)));

  // champion frame
  ctx.strokeStyle = v("--accent"); ctx.lineWidth = 6;
  ctx.strokeRect(190, 220, 700, 640);
  ctx.fillStyle = v("--surface"); ctx.fillRect(193, 223, 694, 634);
  if (champImg) fit(ctx, champImg, 230, 250, 620, 580);
  ctx.fillStyle = v("--text");
  fitText(ctx, champ.name, W - 160, 72, display);
  ctx.fillText(champ.name, W / 2, 950);

  // podium 2-4
  rest.slice(0, 3).forEach((e, i) => {
    const x = 90 + i * 320;
    ctx.fillStyle = v("--surface"); ctx.fillRect(x, 1010, 260, 220);
    ctx.strokeStyle = v("--line"); ctx.lineWidth = 3; ctx.strokeRect(x, 1010, 260, 220);
    if (podiumImgs[i]) fit(ctx, podiumImgs[i], x + 20, 1020, 220, 150);
    ctx.fillStyle = v("--accent2");
    ctx.font = `28px ${display}`;
    ctx.fillText(`#${i + 2}`, x + 130, 1205);
    ctx.fillStyle = v("--text");
    fitText(ctx, e.name, 240, 26, body);
    ctx.fillText(e.name, x + 130, 1268);
  });

  ctx.fillStyle = v("--muted");
  ctx.font = `24px ${body}`;
  ctx.fillText(labels.footer, W / 2, H - 30);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
