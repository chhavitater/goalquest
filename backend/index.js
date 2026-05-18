// index.js – GoalQuest API server
require("dotenv").config();
// Auto-migrate and seed on first deploy
async function initDb() {
  try {
    const pool = require("./db/pool");
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY)`);
    const { rows } = await pool.query(`SELECT COUNT(*) FROM users`);
    if (parseInt(rows[0].count) === 0) {
      console.log("Running first-time setup...");
      require("./db/migrate-runner");
    }
  } catch(e) {
    console.error("Init check failed:", e.message);
  }
}
const express = require("express");
const cors = require("cors");

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

// Request logger (dev)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/goals",        require("./routes/goals"));
app.use("/api/achievements", require("./routes/achievements"));
app.use("/api/checkins",     require("./routes/checkins"));
app.use("/api/reports",      require("./routes/reports"));
app.use("/api/users",        require("./routes/users"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await initDb();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 GoalQuest API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Server startup failed:", err);
    process.exit(1);
  }
}

startServer();
