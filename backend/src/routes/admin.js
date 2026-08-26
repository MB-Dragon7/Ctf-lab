import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
async function nextChallengeCode() {
  const n = (await db.get("SELECT COUNT(*) AS n FROM challenges")).n + 1;
  return "CTF-" + String(n).padStart(3, "0");
}

async function serializeFull(row) {
  const hints = await db.all("SELECT id, text, deduction FROM hints WHERE challenge_id = ? ORDER BY order_index", [row.id]);
  const files = await db.all("SELECT id, name, url, type FROM files WHERE challenge_id = ?", [row.id]);
  return {
    id: row.id, challengeCode: row.challenge_code, title: row.title, slug: row.slug, category: row.category,
    difficulty: row.difficulty, points: row.points, shortDescription: row.short_description, description: row.description,
    learningObjective: row.learning_objective, instructions: row.instructions, author: row.author, status: row.status,
    imageUrl: row.image_url, audioUrl: row.audio_url, solveCount: row.solve_count, createdAt: row.created_at,
    updatedAt: row.updated_at, hints, files,
  };
}

router.get("/stats", async (req, res, next) => {
  try {
    const totalChallenges = (await db.get("SELECT COUNT(*) AS n FROM challenges")).n;
    const activeUsers = (await db.get("SELECT COUNT(*) AS n FROM users WHERE is_admin = 0")).n;
    const totalSolves = (await db.get("SELECT COUNT(*) AS n FROM solves")).n;
    const totalPoints = (await db.get("SELECT COALESCE(SUM(points_earned), 0) AS n FROM solves")).n;
    res.json({ totalChallenges, activeUsers, totalSolves, totalPoints });
  } catch (e) { next(e); }
});

router.get("/challenges", async (req, res, next) => {
  try {
    const rows = await db.all("SELECT * FROM challenges ORDER BY created_at DESC");
    const challenges = await Promise.all(rows.map(serializeFull));
    res.json({ challenges });
  } catch (e) { next(e); }
});

router.post("/challenges", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.title.trim()) return res.status(400).json({ error: "Challenge name is required." });
    if (!b.flag || !b.flag.trim()) return res.status(400).json({ error: "A flag is required to create a challenge." });

    const flagHash = bcrypt.hashSync(b.flag.trim(), 10);
    const code = await nextChallengeCode();
    const info = await db.run(
      `INSERT INTO challenges (challenge_code, title, slug, category, difficulty, points, short_description, description, learning_objective, instructions, author, status, image_url, audio_url, flag_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, b.title.trim(), slugify(b.title), b.category || "Miscellaneous", b.difficulty || "Easy",
        Number(b.points) || 100, b.shortDescription || "", b.description || "", b.learningObjective || "",
        b.instructions || "", b.author || "admin", b.status || "Draft", b.imageUrl || null, b.audioUrl || null, flagHash]
    );
    const challengeId = info.lastInsertRowid;

    for (const h of (b.hints || [])) {
      if (h.text && h.text.trim()) {
        await db.run("INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)",
          [challengeId, h.text.trim(), Number(h.deduction) || 0, (b.hints.indexOf(h))]);
      }
    }
    for (const f of (b.files || [])) {
      if (f.name && f.url) {
        await db.run("INSERT INTO files (challenge_id, name, url, type) VALUES (?, ?, ?, ?)", [challengeId, f.name, f.url, f.type || ""]);
      }
    }

    const row = await db.get("SELECT * FROM challenges WHERE id = ?", [challengeId]);
    res.status(201).json({ challenge: await serializeFull(row) });
  } catch (e) { next(e); }
});

router.put("/challenges/:id", async (req, res, next) => {
  try {
    const row = await db.get("SELECT * FROM challenges WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Challenge not found." });
    const b = req.body || {};

    let flagHash = row.flag_hash;
    if (b.flag && b.flag.trim()) flagHash = bcrypt.hashSync(b.flag.trim(), 10);

    await db.run(
      `UPDATE challenges SET title=?, slug=?, category=?, difficulty=?, points=?, short_description=?, description=?,
        learning_objective=?, instructions=?, author=?, status=?, image_url=?, audio_url=?, flag_hash=?, updated_at=datetime('now')
       WHERE id = ?`,
      [b.title ?? row.title, b.title ? slugify(b.title) : row.slug, b.category ?? row.category, b.difficulty ?? row.difficulty,
        b.points !== undefined ? Number(b.points) : row.points, b.shortDescription ?? row.short_description,
        b.description ?? row.description, b.learningObjective ?? row.learning_objective, b.instructions ?? row.instructions,
        b.author ?? row.author, b.status ?? row.status, b.imageUrl ?? row.image_url, b.audioUrl ?? row.audio_url,
        flagHash, req.params.id]
    );

    if (b.hints) {
      await db.run("DELETE FROM hints WHERE challenge_id = ?", [req.params.id]);
      for (let i = 0; i < b.hints.length; i++) {
        const h = b.hints[i];
        if (h.text && h.text.trim()) {
          await db.run("INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)",
            [req.params.id, h.text.trim(), Number(h.deduction) || 0, i]);
        }
      }
    }
    if (b.files) {
      await db.run("DELETE FROM files WHERE challenge_id = ?", [req.params.id]);
      for (const f of b.files) {
        if (f.name && f.url) {
          await db.run("INSERT INTO files (challenge_id, name, url, type) VALUES (?, ?, ?, ?)", [req.params.id, f.name, f.url, f.type || ""]);
        }
      }
    }

    const updated = await db.get("SELECT * FROM challenges WHERE id = ?", [req.params.id]);
    res.json({ challenge: await serializeFull(updated) });
  } catch (e) { next(e); }
});

router.patch("/challenges/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["Draft", "Published", "Archived"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    await db.run("UPDATE challenges SET status=?, updated_at=datetime('now') WHERE id = ?", [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete("/challenges/:id", async (req, res, next) => {
  try {
    await db.run("DELETE FROM challenges WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
