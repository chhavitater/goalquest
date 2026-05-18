// routes/goals.js
const router = require("express").Router();
const pool = require("../db/pool");
const { auth, requireRole } = require("../middleware/auth");

// ── Validation helper ──────────────────────────────────────────────────────
async function validateWeightage(employeeId, cycleId, newWeightage, excludeGoalId = null) {
  let q = `SELECT COALESCE(SUM(weightage), 0) AS total
            FROM goals
            WHERE employee_id = $1 AND cycle_id = $2 AND status != 'rejected'`;
  const params = [employeeId, cycleId];
  if (excludeGoalId) {
    q += ` AND id != $3`;
    params.push(excludeGoalId);
  }
  const { rows } = await pool.query(q, params);
  return parseInt(rows[0].total) + parseInt(newWeightage);
}

async function countActiveGoals(employeeId, cycleId, excludeGoalId = null) {
  let q = `SELECT COUNT(*) AS cnt FROM goals WHERE employee_id = $1 AND cycle_id = $2 AND status != 'rejected'`;
  const params = [employeeId, cycleId];
  if (excludeGoalId) { q += ` AND id != $3`; params.push(excludeGoalId); }
  const { rows } = await pool.query(q, params);
  return parseInt(rows[0].cnt);
}

async function logAudit(client, userId, action, entityType, entityId, details = {}) {
  await client.query(
    "INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)",
    [userId, action, entityType, entityId, JSON.stringify(details)]
  );
}

// ── GET /api/goals  (scoped by role) ──────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    let query, params;
    const cycleId = req.query.cycle_id || 1;

    if (req.user.role === "employee") {
      query = `SELECT g.*, u.name AS employee_name,
                      json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) AS achievements,
                      json_agg(DISTINCT cc.*) FILTER (WHERE cc.id IS NOT NULL) AS comments
               FROM goals g
               JOIN users u ON u.id = g.employee_id
               LEFT JOIN achievements a ON a.goal_id = g.id
               LEFT JOIN checkin_comments cc ON cc.goal_id = g.id
               WHERE g.employee_id = $1 AND g.cycle_id = $2
               GROUP BY g.id, u.name ORDER BY g.created_at`;
      params = [req.user.id, cycleId];

    } else if (req.user.role === "manager") {
      query = `SELECT g.*, u.name AS employee_name, u.department,
                      json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) AS achievements,
                      json_agg(DISTINCT cc.*) FILTER (WHERE cc.id IS NOT NULL) AS comments
               FROM goals g
               JOIN users u ON u.id = g.employee_id
               LEFT JOIN achievements a ON a.goal_id = g.id
               LEFT JOIN checkin_comments cc ON cc.goal_id = g.id
               WHERE u.manager_id = $1 AND g.cycle_id = $2
               GROUP BY g.id, u.name, u.department ORDER BY u.name, g.created_at`;
      params = [req.user.id, cycleId];

    } else {
      // admin — all goals
      query = `SELECT g.*, u.name AS employee_name, u.department,
                      json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) AS achievements,
                      json_agg(DISTINCT cc.*) FILTER (WHERE cc.id IS NOT NULL) AS comments
               FROM goals g
               JOIN users u ON u.id = g.employee_id
               LEFT JOIN achievements a ON a.goal_id = g.id
               LEFT JOIN checkin_comments cc ON cc.goal_id = g.id
               WHERE g.cycle_id = $1
               GROUP BY g.id, u.name, u.department ORDER BY u.name, g.created_at`;
      params = [cycleId];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/goals  (employee creates goal) ──────────────────────────────
router.post("/", auth, requireRole("employee"), async (req, res) => {
  const { cycle_id = 1, title, thrust_area, description, uom, target, weightage } = req.body;

  if (!title || !thrust_area || !uom || target === undefined || !weightage) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (weightage < 10) return res.status(400).json({ error: "Minimum weightage per goal is 10%" });

  try {
    const count = await countActiveGoals(req.user.id, cycle_id);
    if (count >= 8) return res.status(400).json({ error: "Maximum 8 goals allowed per employee" });

    const newTotal = await validateWeightage(req.user.id, cycle_id, weightage);
    if (newTotal > 100) return res.status(400).json({ error: `Total weightage would be ${newTotal}%. Must not exceed 100%.` });

    const { rows } = await pool.query(
      `INSERT INTO goals (cycle_id, employee_id, title, thrust_area, description, uom, target, weightage, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
      [cycle_id, req.user.id, title, thrust_area, description, uom, target, weightage]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/goals/shared  (manager pushes shared goal) ──────────────────
router.post("/shared", auth, requireRole("manager", "admin"), async (req, res) => {
  const { cycle_id = 1, title, thrust_area, description, uom, target, employee_ids } = req.body;

  if (!title || !thrust_area || !uom || target === undefined || !employee_ids?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = [];
    for (const empId of employee_ids) {
      const { rows } = await client.query(
        `INSERT INTO goals (cycle_id, employee_id, title, thrust_area, description, uom, target, weightage, status, is_shared, shared_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,10,'pending',true,$8) RETURNING *`,
        [cycle_id, empId, title, thrust_area, description, uom, target, req.user.id]
      );
      created.push(rows[0]);
      await logAudit(client, req.user.id, "pushed_shared_goal", "goal", rows[0].id, { employee_id: empId });
    }
    await client.query("COMMIT");
    res.status(201).json(created);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/goals/:id/status  (manager approve/reject) ─────────────────
router.patch("/:id/status", auth, requireRole("manager", "admin"), async (req, res) => {
  const { status, weightage } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [goal] } = await client.query("SELECT * FROM goals WHERE id = $1", [req.params.id]);
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    // Manager can only act on their team's goals
    if (req.user.role === "manager") {
      const { rows: [emp] } = await client.query("SELECT manager_id FROM users WHERE id = $1", [goal.employee_id]);
      if (emp?.manager_id !== req.user.id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Not your team member" });
      }
    }

    const updates = { status, locked_at: status === "approved" ? new Date() : null };
    if (weightage && status === "approved") updates.weightage = weightage;

    const { rows } = await client.query(
      `UPDATE goals SET status=$1, locked_at=$2, weightage=COALESCE($3, weightage), updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [updates.status, updates.locked_at, updates.weightage ?? null, req.params.id]
    );

    await logAudit(client, req.user.id, `${status}_goal`, "goal", goal.id, {
      prev_status: goal.status, new_status: status,
    });

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/goals/:id/unlock  (admin only) ─────────────────────────────
router.patch("/:id/unlock", auth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE goals SET status='pending', locked_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Goal not found" });
    await logAudit(client, req.user.id, "unlocked_goal", "goal", rows[0].id, { reason: req.body.reason ?? "Admin exception" });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── DELETE /api/goals/:id  (employee deletes own draft/pending) ───────────
router.delete("/:id", auth, requireRole("employee"), async (req, res) => {
  try {
    const { rows: [g] } = await pool.query("SELECT * FROM goals WHERE id=$1 AND employee_id=$2", [req.params.id, req.user.id]);
    if (!g) return res.status(404).json({ error: "Goal not found" });
    if (g.status === "approved") return res.status(400).json({ error: "Cannot delete an approved goal" });
    await pool.query("DELETE FROM goals WHERE id=$1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
