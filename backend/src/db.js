import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "ctf.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 100,
  short_description TEXT,
  description TEXT,
  learning_objective TEXT,
  instructions TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  image_url TEXT,
  audio_url TEXT,
  flag_hash TEXT NOT NULL,
  solve_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  deduction INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT
);

CREATE TABLE IF NOT EXISTS solves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  points_earned INTEGER NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, challenge_id)
);
`);

function seedIfEmpty() {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
      "INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)"
    ).run(adminUsername, "admin@ctf-lab.local", hash);
    console.log(`[seed] Created admin account "${adminUsername}" — set ADMIN_PASSWORD in .env to change the password.`);
  }

  const challengeCount = db.prepare("SELECT COUNT(*) AS n FROM challenges").get().n;
  if (challengeCount === 0) {
    const seedChallenges = [
      {
        title: "SQL Injection Basics", category: "Web Security", difficulty: "Easy", points: 100,
        shortDescription: "A login form is hiding something it shouldn't.",
        description: "The staging login form trusts user input a little too much. Find a way past the query without a valid password.",
        learningObjective: "Understand how unsanitized input breaks out of a SQL query.",
        flag: "FLAG{sql_1nj3ct10n_101}",
        hints: [{ text: "What happens if you close the string early?", deduction: 10 }, { text: "OR 1=1 is a classic for a reason.", deduction: 20 }],
      },
      {
        title: "Hidden Message", category: "Steganography", difficulty: "Easy", points: 100,
        shortDescription: "Find the hidden message inside the provided image.",
        description: "The image looks ordinary. It isn't. Something has been tucked away inside it.",
        learningObjective: "Practice basic steganography detection and metadata inspection.",
        flag: "FLAG{hidden_message_found}",
        hints: [{ text: "Check the metadata first.", deduction: 10 }],
      },
      {
        title: "Packet Trail", category: "Networking", difficulty: "Medium", points: 250,
        shortDescription: "A capture file holds the trail of a quiet exfiltration.",
        description: "Traffic was captured off a compromised host. Somewhere in this exchange, a small file left the network in pieces.",
        learningObjective: "Practice reconstructing files and sessions from packet captures.",
        flag: "FLAG{p4ck3ts_d0nt_l1e}",
        hints: [{ text: "Follow the TCP stream.", deduction: 25 }, { text: "Not everything travels over port 80.", deduction: 40 }],
      },
      {
        title: "Locked Binary", category: "Reverse Engineering", difficulty: "Hard", points: 400,
        shortDescription: "A small ELF checks a password before it says yes.",
        description: "This binary asks for a password and refuses to say more. Work out what it actually wants to hear.",
        learningObjective: "Basic static analysis and control-flow reading in a stripped binary.",
        flag: "FLAG{r3v3rs3_3ng1n33r3d}",
        hints: [{ text: "Look for the string comparison routine.", deduction: 50 }],
      },
      {
        title: "The Analyst's Trail", category: "OSINT", difficulty: "Easy", points: 75,
        shortDescription: "Someone left more of a public trail than they meant to.",
        description: "A username, a handful of public posts, and one careless reused photo. Piece together where this trail leads.",
        learningObjective: "Practice methodical open-source reconnaissance.",
        flag: "FLAG{op5ec_f41l}",
        hints: [],
      },
    ];

    const insertChallenge = db.prepare(`
      INSERT INTO challenges (challenge_code, title, slug, category, difficulty, points, short_description, description, learning_objective, author, status, flag_hash)
      VALUES (@code, @title, @slug, @category, @difficulty, @points, @shortDescription, @description, @learningObjective, 'admin', 'Published', @flagHash)
    `);
    const insertHint = db.prepare(`INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)`);

    const tx = db.transaction((list) => {
      list.forEach((c, i) => {
        const code = "CTF-" + String(i + 1).padStart(3, "0");
        const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const flagHash = bcrypt.hashSync(c.flag, 10);
        const info = insertChallenge.run({ code, title: c.title, slug, category: c.category, difficulty: c.difficulty, points: c.points, shortDescription: c.shortDescription, description: c.description, learningObjective: c.learningObjective, flagHash });
        c.hints.forEach((h, idx) => insertHint.run(info.lastInsertRowid, h.text, h.deduction, idx));
      });
    });
    tx(seedChallenges);
    console.log(`[seed] Inserted ${seedChallenges.length} demo challenges.`);
  }
}

seedIfEmpty();
