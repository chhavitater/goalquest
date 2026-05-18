// db/seed.js  – Run after migrate: node db/seed.js
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Clear existing data (order matters for FK constraints) ───────────────
    await client.query("DELETE FROM audit_log");
    await client.query("DELETE FROM checkin_comments");
    await client.query("DELETE FROM achievements");
    await client.query("DELETE FROM goals");
    await client.query("DELETE FROM cycles");
    await client.query("DELETE FROM users");
    await client.query("ALTER SEQUENCE users_id_seq RESTART WITH 1");
    await client.query("ALTER SEQUENCE cycles_id_seq RESTART WITH 1");
    await client.query("ALTER SEQUENCE goals_id_seq RESTART WITH 1");
    await client.query("ALTER SEQUENCE achievements_id_seq RESTART WITH 1");

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // ── Users ────────────────────────────────────────────────────────────────
    // Insert managers first (no manager_id dependency)
    await client.query(`
      INSERT INTO users (name, email, password, role, department, manager_id) VALUES
        ('Arjun Krishnan', 'manager@demo.com',   '${hash("manager123")}', 'manager',  'Sales',      NULL),
        ('Sneha Pillai',   'sneha@demo.com',      '${hash("manager123")}', 'manager',  'Operations', NULL),
        ('HR Admin',       'admin@demo.com',      '${hash("admin123")}',   'admin',    'HR',         NULL)
    `);

    // Now employees referencing manager ids (1 = Arjun, 2 = Sneha)
    await client.query(`
      INSERT INTO users (name, email, password, role, department, manager_id) VALUES
        ('Priya Sharma',  'employee@demo.com',  '${hash("emp123")}', 'employee', 'Sales',      1),
        ('Rajan Nair',    'rajan@demo.com',     '${hash("emp123")}', 'employee', 'Sales',      1),
        ('Divya Menon',   'divya@demo.com',     '${hash("emp123")}', 'employee', 'Operations', 2)
    `);

    // ── Cycle ────────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO cycles (label, active_quarter, goal_open, q1_open, q2_open, q3_open, q4_open)
      VALUES ('FY 2025-26', 'Q2', '2025-05-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-03-01')
    `);

    // ── Goals (employee_id=4 = Priya, 5 = Rajan, 6 = Divya) ─────────────────
    await client.query(`
      INSERT INTO goals (cycle_id, employee_id, title, thrust_area, description, uom, target, weightage, status, is_shared, locked_at)
      VALUES
        (1, 4, 'Increase Sales Revenue',    'Revenue Growth',       'Achieve monthly revenue target of ₹50L', 'Numeric (Min)', 50,  40, 'approved', false, NOW()),
        (1, 4, 'Reduce Customer Churn',     'Customer Experience',  'Bring churn rate below 5%',              '% (Max)',        5,  30, 'approved', false, NOW()),
        (1, 4, 'Zero Safety Incidents',     'Compliance & Risk',    'Maintain zero workplace incidents',       'Zero-based',     0,  30, 'approved', true,  NOW()),
        (1, 5, 'New Client Acquisition',    'Revenue Growth',       'Onboard 10 new enterprise clients',      'Numeric (Min)', 10,  50, 'pending',  false, NULL),
        (1, 5, 'Zero Safety Incidents',     'Compliance & Risk',    'Maintain zero workplace incidents',       'Zero-based',     0,  30, 'pending',  true,  NULL),
        (1, 5, 'Product Training Completion','People & Culture',    'Complete 3 product certifications',       'Numeric (Min)',  3,  20, 'pending',  false, NULL),
        (1, 6, 'Reduce TAT',                'Operational Excellence','Reduce process turnaround time by 20%', 'Numeric (Max)', 20,  50, 'approved', false, NOW()),
        (1, 6, 'SLA Compliance',            'Compliance & Risk',    'Maintain >98% SLA compliance',           '% (Min)',        98, 50, 'approved', false, NOW())
    `);

    // ── Achievements ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO achievements (goal_id, quarter, actual, status) VALUES
        (1, 'Q1', 42,  'On Track'),
        (1, 'Q2', 48,  'On Track'),
        (2, 'Q1', 6.2, 'On Track'),
        (2, 'Q2', 5.1, 'On Track'),
        (3, 'Q1', 0,   'Completed'),
        (3, 'Q2', 0,   'Completed'),
        (7, 'Q1', 22,  'On Track'),
        (7, 'Q2', 19,  'On Track'),
        (8, 'Q1', 98.5,'On Track'),
        (8, 'Q2', 99.1,'Completed')
    `);

    // ── Check-in comments ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO checkin_comments (goal_id, quarter, manager_id, comment) VALUES
        (1, 'Q1', 1, 'Good progress, keep it up.'),
        (2, 'Q1', 1, 'Needs attention on retention strategy.'),
        (3, 'Q1', 1, 'Excellent! Zero incidents this quarter.')
    `);

    // ── Audit log ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES
        (1, 'approved_goal',  'goal', 1, '{"prev_status":"pending","new_status":"approved"}'::jsonb),
        (1, 'approved_goal',  'goal', 2, '{"prev_status":"pending","new_status":"approved"}'::jsonb),
        (3, 'unlocked_goal',  'goal', 3, '{"reason":"Admin exception"}'::jsonb),
        (1, 'approved_goal',  'goal', 3, '{"prev_status":"pending","new_status":"approved"}'::jsonb)
    `);

    await client.query("COMMIT");
    console.log("✅ Seed complete");
    console.log("\n🔑 Demo credentials:");
    console.log("   Employee : employee@demo.com / emp123");
    console.log("   Manager  : manager@demo.com  / manager123");
    console.log("   Admin    : admin@demo.com    / admin123");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
