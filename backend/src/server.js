import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSchema, seedIfEmpty } from "./db.js";
import authRoutes from "./routes/auth.js";
import challengeRoutes from "./routes/challenges.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import adminRoutes from "./routes/admin.js";

async function main() {
  if (!process.env.JWT_SECRET) {
    console.error("Missing JWT_SECRET. Copy .env.example to .env and set values before starting the server.");
    process.exit(1);
  }
  if (!process.env.TURSO_DATABASE_URL) {
    console.error("Missing TURSO_DATABASE_URL. Copy .env.example to .env and set values before starting the server.");
    process.exit(1);
  }

  await initSchema();
  await seedIfEmpty();

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/challenges", challengeRoutes);
  app.use("/api/leaderboard", leaderboardRoutes);
  app.use("/api/admin", adminRoutes);

  app.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`CTF Lab backend running on http://localhost:${port}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
