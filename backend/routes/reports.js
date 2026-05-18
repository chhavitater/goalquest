// routes/reports.js
const router = require("express").Router();
const pool = require("../db/pool");
const { auth, requireRole } = require("../middleware/auth");
const { computeScore } = require("../middleware/scoring");

// ── GET /api/reports/dashboard  (admin stats) ─────────────────────────────
router.get("/dashboard", auth, requireRole("admin", "manager"), async (req, res) => {
  const cycleId = req.query.cycle_id || 1;
  try {
    const [goals, employees, checkins] = await Promise.all([
      pool.query(`SELECT g.*, u.name AS employee_name, u.department
                  FROM goals g JOIN users u ON u.id = g.employee_id WHERE g.cycle_id=$1`, [cycleId]),
      pool.query(`SELECT id, name, role, department, manager_id FROM users`),
      pool.query(`SELECT a.*, g.employee_id, g.uom, g.target
                  FROM achievements a JOIN goals g ON g.id = a.goal_id`),
    ]);

    const allGoals = goals.rows;
    const allEmps  = employees.rows.filter(e => e.role === "employee");

    // Completion rates per quarter
    const quarters = ["Q1","Q2","Q3","Q4"];
    const completionByQuarter = {};
    for (const q of quarters) {
      const empsDone = allEmps.filter(emp => {
        const empApproved = allGoals.filter(g => g.employee_id === emp.id && g.status === "approved");
        if (!empApproved.length) return false;
        return empApproved.every(g => checkins.rows.some(a => a.goal_id === g.id && a.quarter === q && a.actual !== null));
      });
      completionByQuarter[q] = { done: empsDone.length, total: allEmps.length };
    }

    // Goal distribution by thrust area
    const byThrust = {};
    allGoals.forEach(g => { byThrust[g.thrust_area] = (byThrust[g.thrust_area] || 0) + 1; });

    res.json({
      total_goals: allGoals.length,
      approved: allGoals.filter(g => g.status === "approved").length,
      pending: allGoals.filter(g => g.status === "pending").length,
      rejected: allGoals.filter(g => g.status === "rejected").length,
      completion_by_quarter: completionByQuarter,
      by_thrust_area: byThrust,
      employees: allEmps.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/export  (CSV download) ───────────────────────────────
router.get("/export", auth, requireRole("admin", "manager"), async (req, res) => {
  const cycleId = req.query.cycle_id || 1;
  try {
    const { rows } = await pool.query(
      `SELECT u.name AS employee, u.department, g.title AS goal, g.thrust_area, g.uom,
              g.target, g.weightage, g.status,
              a1.actual AS q1_actual, a1.status AS q1_status,
              a2.actual AS q2_actual, a2.status AS q2_status,
              a3.actual AS q3_actual, a3.status AS q3_status,
              a4.actual AS q4_actual, a4.status AS q4_status
       FROM goals g
       JOIN users u ON u.id = g.employee_id
       LEFT JOIN achievements a1 ON a1.goal_id = g.id AND a1.quarter = 'Q1'
       LEFT JOIN achievements a2 ON a2.goal_id = g.id AND a2.quarter = 'Q2'
       LEFT JOIN achievements a3 ON a3.goal_id = g.id AND a3.quarter = 'Q3'
       LEFT JOIN achievements a4 ON a4.goal_id = g.id AND a4.quarter = 'Q4'
       WHERE g.cycle_id = $1
       ORDER BY u.name, g.created_at`,
      [cycleId]
    );

    // Build CSV manually (no extra deps)
    const headers = ["Employee","Department","Goal","Thrust Area","UoM","Target","Weightage","Status","Q1 Actual","Q1 Status","Q2 Actual","Q2 Status","Q3 Actual","Q3 Status","Q4 Actual","Q4 Status"];
    const escape = v => v === null || v === undefined ? "" : `"${String(v).replace(/"/g,'""')}"`;
    const lines = [headers.map(escape).join(",")];
    rows.forEach(r => {
      lines.push([r.employee, r.department, r.goal, r.thrust_area, r.uom, r.target, r.weightage, r.status,
        r.q1_actual, r.q1_status, r.q2_actual, r.q2_status,
        r.q3_actual, r.q3_status, r.q4_actual, r.q4_status].map(escape).join(","));
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="goal_report_${cycleId}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/audit  (audit trail) ────────────────────────────────
router.get("/audit", auth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.name AS user_name
       FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/team/:managerId  (manager's team summary) ────────────
router.get("/team/:managerId", auth, requireRole("manager", "admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.department,
              COUNT(g.id) AS total_goals,
              COUNT(g.id) FILTER (WHERE g.status = 'approved') AS approved,
              COUNT(g.id) FILTER (WHERE g.status = 'pending')  AS pending,
              COALESCE(SUM(g.weightage) FILTER (WHERE g.status = 'approved'), 0) AS total_weightage
       FROM users u
       LEFT JOIN goals g ON g.employee_id = u.id AND g.cycle_id = $2
       WHERE u.manager_id = $1
       GROUP BY u.id, u.name, u.department`,
      [req.params.managerId, req.query.cycle_id || 1]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
