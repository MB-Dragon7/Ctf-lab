import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const router = Router();

const lastSubmitByUser = new Map(); // simple in-memory rate limit: userId:challengeId -> timestamp

function serializeChallenge(row, { includeSolvedFor } = {}) {
  const hints = db
    .prepare("SELECT id, text, deduction FROM hints WHERE challenge_id = ? ORDER BY order_index")
    .all(row.id);
  const files = db
    .prepare("SELECT name, url, type FROM files WHERE challenge_id = ?")
    .all(row.id);
  let solved = false;
  if (includeSolvedFor) {
    solved = !!db
      .prepare("SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?")
      .get(includeSolvedFor, row.id);
  }
  return {
    id: row.id,
    challengeCode: row.challenge_code,
    title: row.title,
    slug: row.slug,
    category: row.category,
    difficulty: row.difficulty,
    points: row.points,
    shortDescription: row.short_description,
    description: row.description,
    learningObjective: row.learning_objective,
    instructions: row.instructions,
    author: row.author,
    status: row.status,
    imageUrl: row.image_url,
    audioUrl: row.audio_url,
    solveCount: row.solve_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hints,
    files,
    solved,
  };
}

router.get("/", optionalAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM challenges WHERE status = 'Published' ORDER BY created_at DESC").all();
  const userId = req.user?.id || null;
  res.json({ challenges: rows.map((r) => serializeChallenge(r, { includeSolvedFor: userId })) });
});

router.get("/:id", optionalAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!row || row.status !== "Published") return res.status(404).json({ error: "Challenge not found." });
  const userId = req.user?.id || null;
  res.json({ challenge: serializeChallenge(row, { includeSolvedFor: userId }) });
});

router.post("/:id/submit", requireAuth, (req, res) => {
  const { flag } = req.body || {};
  if (!flag || !flag.trim()) return res.status(400).json({ error: "Enter a flag first." });

  const rateKey = `${req.user.id}:${req.params.id}`;
  const now = Date.now();
  const last = lastSubmitByUser.get(rateKey) || 0;
  if (now - last < 1500) return res.status(429).json({ error: "Slow down — try again in a moment." });
  lastSubmitByUser.set(rateKey, now);

  const challenge = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!challenge || challenge.status !== "Published") return res.status(404).json({ error: "Challenge not found." });

  const alreadySolved = db
    .prepare("SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?")
    .get(req.user.id, challenge.id);
  if (alreadySolved) return res.status(409).json({ error: "You've already solved this challenge.", correct: true });

  const correct = bcrypt.compareSync(flag.trim(), challenge.flag_hash);
  if (!correct) return res.json({ correct: false });

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO solves (user_id, challenge_id, points_earned, hints_used) VALUES (?, ?, ?, ?)"
    ).run(req.user.id, challenge.id, challenge.points, 0);
    db.prepare("UPDATE challenges SET solve_count = solve_count + 1 WHERE id = ?").run(challenge.id);
    db.prepare("UPDATE users SET total_points = total_points + ? WHERE id = ?").run(challenge.points, req.user.id);
  });
  tx();

  res.json({ correct: true, pointsEarned: challenge.points });
});

export default router;
