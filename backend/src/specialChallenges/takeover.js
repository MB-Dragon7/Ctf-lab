// SPECIAL CHALLENGE PLUGIN
// This file is auto-loaded by src/specialChallenges/loader.js — you don't
// need to register it anywhere. It gets mounted automatically at:
//   /api/special/<this-filename-without-.js>   →  /api/special/takeover
//
// Each plugin file must `export default` an Express Router.

import { Router } from "express";

const router = Router();

// Instead of a passive background setTimeout (which can silently get lost
// on some hosting platforms if the process is throttled), we just remember
// WHEN the takeover was first detected, and check the elapsed time on every
// incoming request. Whichever request first crosses the delay threshold
// triggers the reset. This is self-healing — it can't get "lost".
let firstDetectedAt = null;
let resetInProgress = false;
let lastResetAt = null;

async function reclaimAndReleaseDomain() {
  resetInProgress = true;
  const token = process.env.GITHUB_TOKEN;
  const holderRepo = process.env.GITHUB_HOLDER_REPO; // "owner/repo"
  const domain = process.env.TAKEOVER_TARGET_DOMAIN; // hostname only, e.g. prod-cdn.ignorelist.com

  if (!token || !holderRepo || !domain) {
    console.log("[takeover] reset skipped — GITHUB_TOKEN / GITHUB_HOLDER_REPO / TAKEOVER_TARGET_DOMAIN not fully configured");
    resetInProgress = false;
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const claimRes = await fetch(`https://api.github.com/repos/${holderRepo}/pages`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ cname: domain }),
    });
    console.log(`[takeover] reclaim call status: ${claimRes.status}`);

    await new Promise((r) => setTimeout(r, 5000));

    const releaseRes = await fetch(`https://api.github.com/repos/${holderRepo}/pages`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ cname: null }),
    });
    console.log(`[takeover] release call status: ${releaseRes.status} — subdomain should be dangling again`);
    lastResetAt = Date.now();
  } catch (e) {
    console.error("[takeover] reclaim/release failed:", e.message);
  }

  firstDetectedAt = null;
  resetInProgress = false;
}

async function checkTarget(targetUrl, notFoundMarker) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(targetUrl, { redirect: "manual", signal: controller.signal });
    clearTimeout(timeout);
    if (r.status >= 300 && r.status < 400) return true;
    if (!r.ok) return false;
    const text = await r.text();
    return !text.includes(notFoundMarker);
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

router.get("/", async (req, res) => {
  const targetUrl = process.env.TAKEOVER_TARGET_URL;
  const flag = process.env.TAKEOVER_FLAG;
  const notFoundMarker = process.env.TAKEOVER_NOT_FOUND_MARKER || "There isn't a GitHub Pages site here";
  const delayMs = (Number(process.env.TAKEOVER_RESET_DELAY_MINUTES) || 3) * 60 * 1000;

  if (!targetUrl || !flag) {
    return res.status(500).json({ error: "This challenge isn't configured on the server yet." });
  }

  let takenOver = false;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      takenOver = await checkTarget(targetUrl, notFoundMarker);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (lastError) {
    return res.json({ takenOver: false, checkedAt: new Date().toISOString() });
  }

  if (takenOver) {
    if (!firstDetectedAt) {
      firstDetectedAt = Date.now();
      console.log(`[takeover] takeover detected at ${new Date(firstDetectedAt).toISOString()} — will reset once ${delayMs / 60000} min have elapsed`);
    }
    const elapsed = Date.now() - firstDetectedAt;
    if (elapsed >= delayMs && !resetInProgress) {
      console.log(`[takeover] ${Math.round(elapsed / 1000)}s elapsed — triggering reset now`);
      reclaimAndReleaseDomain(); // fire and forget, don't block this response
    }
    return res.json({
      takenOver: true, flag, checkedAt: new Date().toISOString(),
      resetInMs: Math.max(0, delayMs - elapsed),
    });
  }

  firstDetectedAt = null;
  return res.json({ takenOver: false, checkedAt: new Date().toISOString() });
});

export default router;
