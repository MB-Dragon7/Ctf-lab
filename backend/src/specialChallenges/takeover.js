// SPECIAL CHALLENGE PLUGIN
// This file is auto-loaded by src/specialChallenges/loader.js — you don't
// need to register it anywhere. It gets mounted automatically at:
//   /api/special/<this-filename-without-.js>   →  /api/special/takeover
//
// Each plugin file must `export default` an Express Router.

import { Router } from "express";

const router = Router();

// In-memory reset timer. Not durable across server restarts, which is fine
// for a practice platform — if the server restarts mid-timer, the timer
// just doesn't fire; re-check the target and it'll pick back up next solve.
let resetTimer = null;
let resetInProgress = false;

// Reclaims the custom domain onto our own "holder" GitHub Pages repo (which
// works because we own the DNS, so GitHub lets us verify it), then
// immediately releases it again. Net effect: the solver's claim is kicked
// out, and the domain ends up fully unclaimed again — vulnerable for the
// next solver — without ever needing access to the solver's own account.
async function reclaimAndReleaseDomain() {
  resetInProgress = true;
  const token = process.env.GITHUB_TOKEN;
  const holderRepo = process.env.GITHUB_HOLDER_REPO; // "owner/repo"
  const domain = process.env.TAKEOVER_TARGET_DOMAIN; // hostname only, e.g. prod-cdn.ignorelist.com

  if (!token || !holderRepo || !domain) {
    console.log("[takeover] reset skipped — GITHUB_TOKEN / GITHUB_HOLDER_REPO / TAKEOVER_TARGET_DOMAIN not fully configured");
    resetInProgress = false;
    resetTimer = null;
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
  } catch (e) {
    console.error("[takeover] reclaim/release failed:", e.message);
  }

  resetInProgress = false;
  resetTimer = null;
}

function scheduleResetIfNeeded() {
  if (resetTimer || resetInProgress) return; // already scheduled or running
  const minutes = Number(process.env.TAKEOVER_RESET_DELAY_MINUTES) || 3;
  resetTimer = setTimeout(reclaimAndReleaseDomain, minutes * 60 * 1000);
  console.log(`[takeover] takeover detected — auto-reset scheduled in ${minutes} minute(s)`);
}

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
      scheduleResetIfNeeded();
      return res.json({ takenOver: true, flag, checkedAt: new Date().toISOString() });
    }
    return res.json({ takenOver: false, checkedAt: new Date().toISOString() });
  } catch (e) {
    return res.json({ takenOver: false, error: "Target didn't respond — try again in a moment.", checkedAt: new Date().toISOString() });
  }
});

export default router;
