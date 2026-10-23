import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryPrompt, themePrompt, claudeUrl, extractJson, themesFromAnswer } from "../src/core/prompts.js";
import { sanitizeTheme } from "../src/core/theme.js";
import { validateCategory } from "../src/core/catalog.js";

test("prompts carry the brief and the allowed values", () => {
  assert.match(categoryPrompt("Stand di JoJo", 16), /Stand di JoJo[\s\S]*exactly 16/);
  const tp = themePrompt({ description: "neon Tokyo", base: { colors: { bg: "#000000" } }, count: 3, withImage: true });
  assert.match(tp, /3 visual themes[\s\S]*attach[\s\S]*neon Tokyo[\s\S]*#000000[\s\S]*Press Start 2P[\s\S]*sunset/);
  const url = claudeUrl(tp);
  assert.ok(url.startsWith("https://claude.ai/new?q="));
  assert.ok(url.length < 8000, "pre-filled link stays a reasonable length");
});

test("extractJson finds JSON in a code block, bare, or surrounded by text", () => {
  assert.deepEqual(extractJson('Ecco:\n```json\n{"a":1}\n```\nBuon divertimento!'), { a: 1 });
  assert.deepEqual(extractJson('{"a":2}'), { a: 2 });
  assert.deepEqual(extractJson('Here you go: {"a":3} enjoy'), { a: 3 });
  assert.throws(() => extractJson("no json here"), /no valid JSON/);
});

test("pasted answers become valid drafts", () => {
  const cat = extractJson('```json\n{"id":"jojo-stands","group":"custom","name":{"it":"Stand","en":"Stands"},"items":[{"name":"Star Platinum","wiki":"Jotaro Kujo"},{"name":"The World","wiki":"Dio Brando"}]}\n```');
  assert.deepEqual(validateCategory(cat), []);
  const theme = { id: "x-y", name: { it: "A", en: "A" }, colors: { bg: "#000000", bg2: "#111111", surface: "#222222", text: "#ffffff", muted: "#999999", accent: "#ff00ff", accent2: "#00ffff", line: "#333333" },
    fonts: { display: "Orbitron", body: "Rajdhani" }, shape: { corners: "cut", radius: 0, border: "solid", borderWidth: 1 },
    effects: { background: "grid", title: "glow", shadow: "glow", case: "none", tracking: 0.05 } };
  for (const answer of [theme, [theme], { themes: [theme, theme] }]) {
    for (const t of themesFromAnswer(answer)) assert.deepEqual(sanitizeTheme(t).errors, []);
  }
});
