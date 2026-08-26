import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const rows = db
    .prepare(`
      SELECT u.username AS username, u.total_points AS points,
             (SELECT COUNT(*) FROM solves s WHERE s.user_id = u.id) AS solves,
             (SELECT MAX(submitted_at) FROM solves s WHERE s.user_id = u.id) AS lastSolve
      FROM users u
      WHERE u.is_admin = 0
      ORDER BY u.total_points DESC, username ASC
    `)
    .all();
  res.json({ leaderboard: rows });
});

export default router;
