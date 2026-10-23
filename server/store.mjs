// File-backed store for what the admin publishes (categories, themes). One JSON file per collection, atomic writes.
// Small on purpose: a few hundred categories fit comfortably; swap for SQLite if that ever changes.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createStore(dir, name = "categories") {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  let records = {};
  try {
    records = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  let writing = Promise.resolve();

  const persist = () => {
    // serialise writes; write to a temp file then rename so a crash never leaves half a file
    writing = writing.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(records, null, 2));
      await rename(tmp, file);
    });
    return writing;
  };

  return {
    list: () => Object.values(records).sort((a, b) => a.createdAt - b.createdAt),
    get: (id) => records[id],
    async put(record) {
      const now = Date.now();
      records[record.id] = { ...record, createdAt: records[record.id]?.createdAt ?? now, updatedAt: now };
      await persist();
      return records[record.id];
    },
    async remove(id) {
      if (!records[id]) return false;
      delete records[id];
      await persist();
      return true;
    },
  };
}
