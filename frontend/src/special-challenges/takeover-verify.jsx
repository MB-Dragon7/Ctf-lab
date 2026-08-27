// SPECIAL CHALLENGE PLUGIN (frontend)
// Auto-discovered by src/specialChallenges.js via Vite's import.meta.glob —
// you don't need to import or register this file anywhere else.
//
// `meta.hash` controls the shareable URL: this page is reachable at
//   https://yoursite.com/#takeover-verify
//
// To add a new special challenge page:
//   1. Copy this file, rename it, change `meta.hash` to something unique
//   2. Write your component as the default export
//   3. Rebuild the frontend — it's live at #<your-hash>, no other file touched

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle2 } from "lucide-react";
import { apiRequest } from "../api.js";

export const meta = {
  hash: "takeover-verify",
  title: "Live Takeover Verification",
};

// Reused both by the standalone page below AND by the challenge detail
// page's flag box (via specialChallenges.js's registry) — one source of
// truth for "is this taken over yet".
export async function checkStatus() {
  return apiRequest("/special/takeover");
}

const C = {
  bg2: "#0D1317", card: "#111A1F", cardBorder: "#1C282E",
  green: "#00FF88", text: "#E8F0F2", muted: "#819099", warning: "#FFB020", error: "#FF4D6D",
};
const MONO = "ui-monospace, SFMono-Regular, 'Roboto Mono', Menlo, Consolas, monospace";

function Panel({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}
function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase",
      background: C.green, color: "#04140C", border: "none", borderRadius: 8, padding: "10px 18px",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

export default function TakeoverVerifyView() {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const result = await apiRequest("/special/takeover");
      setStatus(result);
      if (result.takenOver) setAutoPoll(false);
    } catch (e) {
      setStatus({ takenOver: false, error: e.message });
    }
    setChecking(false);
  }, []);

  useEffect(() => { check(); }, [check]);

  useEffect(() => {
    if (!autoPoll) return;
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [autoPoll, check]);

  function copyFlag() {
    if (status?.flag) {
      navigator.clipboard?.writeText(status.flag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 20px", fontFamily: MONO, color: C.text }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>{meta.title}</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 22 }}>
        This checks the target subdomain in real time. Once you've successfully claimed it, the flag appears here automatically.
      </p>
      <Panel style={{ textAlign: "center", padding: 32 }}>
        {status?.takenOver ? (
          <>
            <CheckCircle2 size={36} color={C.green} style={{ marginBottom: 14 }} />
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Takeover confirmed. Your flag:</div>
            <div onClick={copyFlag} style={{
              fontFamily: MONO, fontSize: 18, color: C.green, background: C.bg2, border: `1px solid ${C.green}55`,
              borderRadius: 8, padding: "14px 18px", marginBottom: 14, cursor: "pointer", wordBreak: "break-all",
            }}>{status.flag}</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>{copied ? "Copied!" : "Click the flag to copy it"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>Paste this into the challenge's flag submission box to complete it.</div>
          </>
        ) : (
          <>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: checking ? C.warning : C.error, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>{checking ? "Checking..." : "Not taken over yet."}</div>
            {status?.error && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{status.error}</div>}
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>{autoPoll ? "Auto-checking every 5 seconds." : "Auto-check paused."}</div>
            <PrimaryButton onClick={check} disabled={checking}>{checking ? "Checking..." : "Check Now"}</PrimaryButton>
          </>
        )}
      </Panel>
    </div>
  );
}
