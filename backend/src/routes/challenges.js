import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const router = Router();

const lastSubmitByUser = new Map(); // simple in-memory rate limit: userId:challengeId -> timestamp

async function serializeChallenge(row, { includeSolvedFor } = {}) {
  const hints = await db.all(
    "SELECT id, text, deduction FROM hints WHERE challenge_id = ? ORDER BY order_index",
    [row.id]
  );
  const files = await db.all("SELECT name, url, type FROM files WHERE challenge_id = ?", [row.id]);
  const customBlocks = await db.all(
    "SELECT title, content FROM challenge_blocks WHERE challenge_id = ? ORDER BY order_index",
    [row.id]
  );
  let solved = false;
  if (includeSolvedFor) {
    const s = await db.get(
      "SELECT 1 AS present FROM solves WHERE user_id = ? AND challenge_id = ?",
      [includeSolvedFor, row.id]
    );
    solved = !!s;
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
    customBlocks,
    solved,
  };
}

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT * FROM challenges WHERE status = 'Published' ORDER BY created_at DESC");
    const userId = req.user?.id || null;
    const challenges = await Promise.all(rows.map((r) => serializeChallenge(r, { includeSolvedFor: userId })));
    res.json({ challenges });
  } catch (e) { next(e); }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const row = await db.get("SELECT * FROM challenges WHERE id = ?", [req.params.id]);
    if (!row || row.status !== "Published") return res.status(404).json({ error: "Challenge not found." });
    const userId = req.user?.id || null;
    res.json({ challenge: await serializeChallenge(row, { includeSolvedFor: userId }) });
  } catch (e) { next(e); }
});

router.post("/:id/submit", requireAuth, async (req, res, next) => {
  try {
    const { flag } = req.body || {};
    if (!flag || !flag.trim()) return res.status(400).json({ error: "Enter a flag first." });

    const rateKey = `${req.user.id}:${req.params.id}`;
    const now = Date.now();
    const last = lastSubmitByUser.get(rateKey) || 0;
    if (now - last < 1500) return res.status(429).json({ error: "Slow down — try again in a moment." });
    lastSubmitByUser.set(rateKey, now);

    const challenge = await db.get("SELECT * FROM challenges WHERE id = ?", [req.params.id]);
    if (!challenge || challenge.status !== "Published") return res.status(404).json({ error: "Challenge not found." });

    const alreadySolved = await db.get(
      "SELECT 1 AS present FROM solves WHERE user_id = ? AND challenge_id = ?",
      [req.user.id, challenge.id]
    );
    if (alreadySolved) return res.status(409).json({ error: "You've already solved this challenge.", correct: true });

    const correct = bcrypt.compareSync(flag.trim(), challenge.flag_hash);
    if (!correct) return res.json({ correct: false });

    await db.run(
      "INSERT INTO solves (user_id, challenge_id, points_earned, hints_used) VALUES (?, ?, ?, ?)",
      [req.user.id, challenge.id, challenge.points, 0]
    );
    await db.run("UPDATE challenges SET solve_count = solve_count + 1 WHERE id = ?", [challenge.id]);
    await db.run("UPDATE users SET total_points = total_points + ? WHERE id = ?", [challenge.points, req.user.id]);

    res.json({ correct: true, pointsEarned: challenge.points });
  } catch (e) { next(e); }
});

export default router;
