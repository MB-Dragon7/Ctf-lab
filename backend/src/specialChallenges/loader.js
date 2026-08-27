// Scans this folder for plugin files and mounts each one automatically at
// /api/special/<filename>. To add a new special challenge:
//
//   1. Create a new file here, e.g. src/specialChallenges/myChallenge.js
//   2. `export default` an Express Router from it
//   3. Restart the server — that's it, nothing else to wire up.
//
// It becomes reachable at /api/special/myChallenge automatically.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadSpecialChallenges(app) {
  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith(".js") && f !== "loader.js");

  for (const file of files) {
    const id = path.basename(file, ".js");
    try {
      const mod = await import(pathToFileURL(path.join(__dirname, file)).href);
      if (!mod.default) {
        console.warn(`[special-challenges] ${file} has no default export — skipped.`);
        continue;
      }
      app.use(`/api/special/${id}`, mod.default);
      console.log(`[special-challenges] mounted /api/special/${id}`);
    } catch (e) {
      console.error(`[special-challenges] failed to load ${file}:`, e.message);
    }
  }
}
