require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('employee','manager','admin')),
        department TEXT,
        manager_id INT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cycles (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        active_quarter TEXT NOT NULL DEFAULT 'Q1',
        goal_open DATE, q1_open DATE, q2_open DATE, q3_open DATE, q4_open DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        cycle_id INT NOT NULL REFERENCES cycles(id),
        employee_id INT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        thrust_area TEXT NOT NULL,
        description TEXT,
        uom TEXT NOT NULL,
        target NUMERIC NOT NULL,
        weightage INT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        is_shared BOOLEAN DEFAULT FALSE,
        shared_from INT REFERENCES users(id),
        locked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id SERIAL PRIMARY KEY,
        goal_id INT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        quarter TEXT NOT NULL,
        actual NUMERIC,
        status TEXT DEFAULT 'Not Started',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (goal_id, quarter)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS checkin_comments (
        id SERIAL PRIMARY KEY,
        goal_id INT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        quarter TEXT NOT NULL,
        manager_id INT NOT NULL REFERENCES users(id),
        comment TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("Migrations done.");

    // Seed only if users table is empty
    const { rows } = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(rows[0].count) === 0) {
      console.log("Seeding demo data...");
      const bcrypt = require("bcryptjs");
      const h = (pw) => bcrypt.hashSync(pw, 10);

      await client.query(`
        INSERT INTO users (name, email, password, role, department) VALUES
        ('Arjun Krishnan', 'manager@demo.com', '${bcrypt.hashSync("manager123",10)}', 'manager', 'Sales'),
        ('Sneha Pillai', 'sneha@demo.com', '${bcrypt.hashSync("manager123",10)}', 'manager', 'Operations'),
        ('HR Admin', 'admin@demo.com', '${bcrypt.hashSync("admin123",10)}', 'admin', 'HR')
      `);

      await client.query(`
        INSERT INTO users (name, email, password, role, department, manager_id) VALUES
        ('Priya Sharma', 'employee@demo.com', '${bcrypt.hashSync("emp123",10)}', 'employee', 'Sales', 1),
        ('Rajan Nair', 'rajan@demo.com', '${bcrypt.hashSync("emp123",10)}', 'employee', 'Sales', 1),
        ('Divya Menon', 'divya@demo.com', '${bcrypt.hashSync("emp123",10)}', 'employee', 'Operations', 2)
      `);

      await client.query(`
        INSERT INTO cycles (label, active_quarter, goal_open, q1_open, q2_open, q3_open, q4_open)
        VALUES ('FY 2025-26', 'Q2', '2025-05-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-03-01')
      `);

      await client.query(`
        INSERT INTO goals (cycle_id, employee_id, title, thrust_area, description, uom, target, weightage, status, is_shared, locked_at) VALUES
        (1,4,'Increase Sales Revenue','Revenue Growth','Achieve monthly revenue target of 50L','Numeric (Min)',50,40,'approved',false,NOW()),
        (1,4,'Reduce Customer Churn','Customer Experience','Bring churn rate below 5%','% (Max)',5,30,'approved',false,NOW()),
        (1,4,'Zero Safety Incidents','Compliance & Risk','Maintain zero workplace incidents','Zero-based',0,30,'approved',true,NOW()),
        (1,5,'New Client Acquisition','Revenue Growth','Onboard 10 new enterprise clients','Numeric (Min)',10,50,'pending',false,NULL),
        (1,5,'Zero Safety Incidents','Compliance & Risk','Maintain zero workplace incidents','Zero-based',0,30,'pending',true,NULL),
        (1,5,'Product Training Completion','People & Culture','Complete 3 product certifications','Numeric (Min)',3,20,'pending',false,NULL)
      `);

      await client.query(`
        INSERT INTO achievements (goal_id, quarter, actual, status) VALUES
        (1,'Q1',42,'On Track'),(1,'Q2',48,'On Track'),
        (2,'Q1',6.2,'On Track'),(2,'Q2',5.1,'On Track'),
        (3,'Q1',0,'Completed'),(3,'Q2',0,'Completed')
      `);

      await client.query(`
        INSERT INTO checkin_comments (goal_id, quarter, manager_id, comment) VALUES
        (1,'Q1',1,'Good progress, keep it up.'),
        (2,'Q1',1,'Needs attention on retention strategy.'),
        (3,'Q1',1,'Excellent! Zero incidents this quarter.')
      `);

      console.log("Seed complete.");
      console.log("Credentials — employee@demo.com/emp123 | manager@demo.com/manager123 | admin@demo.com/admin123");
    } else {
      console.log("Data already exists, skipping seed.");
    }
  } catch (err) {
    console.error("Setup error:", err.message);
  } finally {
    client.release();
    pool.end();
  }
}

run().then(() => {
  require("./index.js");
});