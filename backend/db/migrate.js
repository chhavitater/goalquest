// db/migrate.js  – Run once: node db/migrate.js
require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Users ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        name        TEXT        NOT NULL,
        email       TEXT        NOT NULL UNIQUE,
        password    TEXT        NOT NULL,
        role        TEXT        NOT NULL CHECK (role IN ('employee','manager','admin')),
        department  TEXT,
        manager_id  INT         REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Goal cycles ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS cycles (
        id            SERIAL PRIMARY KEY,
        label         TEXT    NOT NULL,           -- e.g. "FY 2025-26"
        active_quarter TEXT   NOT NULL DEFAULT 'Q1',
        goal_open     DATE,
        q1_open       DATE,
        q2_open       DATE,
        q3_open       DATE,
        q4_open       DATE,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Goals ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id            SERIAL PRIMARY KEY,
        cycle_id      INT         NOT NULL REFERENCES cycles(id),
        employee_id   INT         NOT NULL REFERENCES users(id),
        title         TEXT        NOT NULL,
        thrust_area   TEXT        NOT NULL,
        description   TEXT,
        uom           TEXT        NOT NULL CHECK (uom IN ('Numeric (Min)','Numeric (Max)','% (Min)','% (Max)','Timeline','Zero-based')),
        target        NUMERIC     NOT NULL,
        weightage     INT         NOT NULL CHECK (weightage >= 10 AND weightage <= 100),
        status        TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','pending','approved','rejected')),
        is_shared     BOOLEAN     DEFAULT FALSE,
        shared_from   INT         REFERENCES users(id),
        locked_at     TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Quarterly achievements ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id            SERIAL PRIMARY KEY,
        goal_id       INT         NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        quarter       TEXT        NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
        actual        NUMERIC,
        status        TEXT        DEFAULT 'Not Started'
                                  CHECK (status IN ('Not Started','On Track','Completed')),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (goal_id, quarter)
      );
    `);

    // ── Check-in comments ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS checkin_comments (
        id            SERIAL PRIMARY KEY,
        goal_id       INT         NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        quarter       TEXT        NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
        manager_id    INT         NOT NULL REFERENCES users(id),
        comment       TEXT        NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Audit log ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id            SERIAL PRIMARY KEY,
        user_id       INT         REFERENCES users(id),
        action        TEXT        NOT NULL,
        entity_type   TEXT,                       -- 'goal', 'achievement', etc.
        entity_id     INT,
        details       JSONB,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Indexes ──────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_goals_employee ON goals(employee_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_goals_cycle ON goals(cycle_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_achievements_goal ON achievements(goal_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);`);

    await client.query("COMMIT");
    console.log("✅ Migration complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
