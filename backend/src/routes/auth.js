import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: !!user.is_admin,
    totalPoints: user.total_points,
    createdAt: user.created_at,
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !password || username.trim().length < 3 || password.length < 4) {
      return res.status(400).json({ error: "Username (3+ chars) and password (4+ chars) are required." });
    }
    const existing = await db.get("SELECT id FROM users WHERE username = ?", [username.trim()]);
    if (existing) return res.status(409).json({ error: "That username is already taken." });

    const hash = bcrypt.hashSync(password, 10);
    const info = await db.run(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username.trim(), email || null, hash]
    );
    const user = await db.get("SELECT * FROM users WHERE id = ?", [info.lastInsertRowid]);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
    const user = await db.get("SELECT * FROM users WHERE username = ?", [username.trim()]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await db.get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

export default router;
