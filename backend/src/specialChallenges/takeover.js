// SPECIAL CHALLENGE PLUGIN
// This file is auto-loaded by src/specialChallenges/loader.js — you don't
// need to register it anywhere. It gets mounted automatically at:
//   /api/special/<this-filename-without-.js>   →  /api/special/takeover
//
// Each plugin file must `export default` an Express Router.

import { Router } from "express";

const router = Router();

router.get("/", async (req, res) => {
  const targetUrl = process.env.TAKEOVER_TARGET_URL;
  const flag = process.env.TAKEOVER_FLAG;
  const notFoundMarker = process.env.TAKEOVER_NOT_FOUND_MARKER || "There isn't a GitHub Pages site here";

  if (!targetUrl || !flag) {
    return res.status(500).json({ error: "This challenge isn't configured on the server yet." });
  }

  try {
    const r = await fetch(targetUrl, { redirect: "follow" });
    const text = await r.text();
    const takenOver = r.ok && !text.includes(notFoundMarker);

    if (takenOver) {
      return res.json({ takenOver: true, flag, checkedAt: new Date().toISOString() });
    }
    return res.json({ takenOver: false, checkedAt: new Date().toISOString() });
  } catch (e) {
    return res.json({ takenOver: false, error: "Target didn't respond — try again in a moment.", checkedAt: new Date().toISOString() });
  }
});

export default router;
