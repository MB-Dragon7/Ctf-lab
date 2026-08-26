import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function nextChallengeCode() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM challenges").get().n + 1;
  return "CTF-" + String(n).padStart(3, "0");
}

function serializeFull(row) {
  const hints = db.prepare("SELECT id, text, deduction FROM hints WHERE challenge_id = ? ORDER BY order_index").all(row.id);
  const files = db.prepare("SELECT id, name, url, type FROM files WHERE challenge_id = ?").all(row.id);
  return {
    id: row.id, challengeCode: row.challenge_code, title: row.title, slug: row.slug, category: row.category,
    difficulty: row.difficulty, points: row.points, shortDescription: row.short_description, description: row.description,
    learningObjective: row.learning_objective, instructions: row.instructions, author: row.author, status: row.status,
    imageUrl: row.image_url, audioUrl: row.audio_url, solveCount: row.solve_count, createdAt: row.created_at,
    updatedAt: row.updated_at, hints, files,
  };
}

router.get("/stats", (req, res) => {
  const totalChallenges = db.prepare("SELECT COUNT(*) AS n FROM challenges").get().n;
  const activeUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 0").get().n;
  const totalSolves = db.prepare("SELECT COUNT(*) AS n FROM solves").get().n;
  const totalPoints = db.prepare("SELECT COALESCE(SUM(points_earned), 0) AS n FROM solves").get().n;
  res.json({ totalChallenges, activeUsers, totalSolves, totalPoints });
});

router.get("/challenges", (req, res) => {
  const rows = db.prepare("SELECT * FROM challenges ORDER BY created_at DESC").all();
  res.json({ challenges: rows.map(serializeFull) });
});

router.post("/challenges", (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: "Challenge name is required." });
  if (!b.flag || !b.flag.trim()) return res.status(400).json({ error: "A flag is required to create a challenge." });

  const flagHash = bcrypt.hashSync(b.flag.trim(), 10);
  const info = db.prepare(`
    INSERT INTO challenges (challenge_code, title, slug, category, difficulty, points, short_description, description, learning_objective, instructions, author, status, image_url, audio_url, flag_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextChallengeCode(), b.title.trim(), slugify(b.title), b.category || "Miscellaneous", b.difficulty || "Easy",
    Number(b.points) || 100, b.shortDescription || "", b.description || "", b.learningObjective || "",
    b.instructions || "", b.author || "admin", b.status || "Draft", b.imageUrl || null, b.audioUrl || null, flagHash
  );
  const challengeId = info.lastInsertRowid;

  const insertHint = db.prepare("INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)");
  (b.hints || []).forEach((h, i) => { if (h.text && h.text.trim()) insertHint.run(challengeId, h.text.trim(), Number(h.deduction) || 0, i); });

  const insertFile = db.prepare("INSERT INTO files (challenge_id, name, url, type) VALUES (?, ?, ?, ?)");
  (b.files || []).forEach((f) => { if (f.name && f.url) insertFile.run(challengeId, f.name, f.url, f.type || ""); });

  const row = db.prepare("SELECT * FROM challenges WHERE id = ?").get(challengeId);
  res.status(201).json({ challenge: serializeFull(row) });
});

router.put("/challenges/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Challenge not found." });
  const b = req.body || {};

  let flagHash = row.flag_hash;
  if (b.flag && b.flag.trim()) flagHash = bcrypt.hashSync(b.flag.trim(), 10);

  db.prepare(`
    UPDATE challenges SET title=?, slug=?, category=?, difficulty=?, points=?, short_description=?, description=?,
      learning_objective=?, instructions=?, author=?, status=?, image_url=?, audio_url=?, flag_hash=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(
    b.title ?? row.title, b.title ? slugify(b.title) : row.slug, b.category ?? row.category, b.difficulty ?? row.difficulty,
    b.points !== undefined ? Number(b.points) : row.points, b.shortDescription ?? row.short_description,
    b.description ?? row.description, b.learningObjective ?? row.learning_objective, b.instructions ?? row.instructions,
    b.author ?? row.author, b.status ?? row.status, b.imageUrl ?? row.image_url, b.audioUrl ?? row.audio_url,
    flagHash, req.params.id
  );

  if (b.hints) {
    db.prepare("DELETE FROM hints WHERE challenge_id = ?").run(req.params.id);
    const insertHint = db.prepare("INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)");
    b.hints.forEach((h, i) => { if (h.text && h.text.trim()) insertHint.run(req.params.id, h.text.trim(), Number(h.deduction) || 0, i); });
  }
  if (b.files) {
    db.prepare("DELETE FROM files WHERE challenge_id = ?").run(req.params.id);
    const insertFile = db.prepare("INSERT INTO files (challenge_id, name, url, type) VALUES (?, ?, ?, ?)");
    b.files.forEach((f) => { if (f.name && f.url) insertFile.run(req.params.id, f.name, f.url, f.type || ""); });
  }

  const updated = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  res.json({ challenge: serializeFull(updated) });
});

router.patch("/challenges/:id/status", (req, res) => {
  const { status } = req.body || {};
  if (!["Draft", "Published", "Archived"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  db.prepare("UPDATE challenges SET status=?, updated_at=datetime('now') WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true });
});

router.delete("/challenges/:id", (req, res) => {
  db.prepare("DELETE FROM challenges WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
