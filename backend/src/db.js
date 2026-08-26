import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("Missing TURSO_DATABASE_URL. Set it in your environment (see .env.example).");
  process.exit(1);
}

const client = createClient({ url, authToken });

// Small wrapper so the rest of the app can use simple get/all/run calls
// instead of dealing with the raw libsql result-set shape everywhere.
export const db = {
  async get(sql, args = []) {
    const rs = await client.execute({ sql, args });
    return rs.rows[0] || null;
  },
  async all(sql, args = []) {
    const rs = await client.execute({ sql, args });
    return rs.rows;
  },
  async run(sql, args = []) {
    const rs = await client.execute({ sql, args });
    return { lastInsertRowid: Number(rs.lastInsertRowid ?? 0), changes: rs.rowsAffected };
  },
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS challenges (
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
  )`,
  `CREATE TABLE IF NOT EXISTS hints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    deduction INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS solves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    points_earned INTEGER NOT NULL,
    hints_used INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, challenge_id)
  )`,
];

export async function initSchema() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
  }
}

const SEED_CHALLENGES = [
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

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function seedIfEmpty() {
  const userCount = (await db.get("SELECT COUNT(*) AS n FROM users")).n;
  if (userCount === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const hash = bcrypt.hashSync(adminPassword, 10);
    await db.run(
      "INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)",
      [adminUsername, "admin@ctf-lab.local", hash]
    );
    console.log(`[seed] Created admin account "${adminUsername}".`);
  }

  const challengeCount = (await db.get("SELECT COUNT(*) AS n FROM challenges")).n;
  if (challengeCount === 0) {
    for (let i = 0; i < SEED_CHALLENGES.length; i++) {
      const c = SEED_CHALLENGES[i];
      const code = "CTF-" + String(i + 1).padStart(3, "0");
      const slug = slugify(c.title);
      const flagHash = bcrypt.hashSync(c.flag, 10);
      const info = await db.run(
        `INSERT INTO challenges (challenge_code, title, slug, category, difficulty, points, short_description, description, learning_objective, author, status, flag_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'Published', ?)`,
        [code, c.title, slug, c.category, c.difficulty, c.points, c.shortDescription, c.description, c.learningObjective, flagHash]
      );
      for (let h = 0; h < c.hints.length; h++) {
        await db.run(
          "INSERT INTO hints (challenge_id, text, deduction, order_index) VALUES (?, ?, ?, ?)",
          [info.lastInsertRowid, c.hints[h].text, c.hints[h].deduction, h]
        );
      }
    }
    console.log(`[seed] Inserted ${SEED_CHALLENGES.length} demo challenges.`);
  }
}
