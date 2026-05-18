// routes/achievements.js
const router = require("express").Router();
const pool = require("../db/pool");
const { auth, requireRole } = require("../middleware/auth");
const { computeScore } = require("../middleware/scoring");

// ── PUT /api/achievements/:goalId/:quarter  (employee logs actual) ─────────
router.put("/:goalId/:quarter", auth, requireRole("employee"), async (req, res) => {
  const { goalId, quarter } = req.params;
  const { actual, status } = req.body;

  if (!["Q1","Q2","Q3","Q4"].includes(quarter)) {
    return res.status(400).json({ error: "Quarter must be Q1, Q2, Q3, or Q4" });
  }
  if (!["Not Started","On Track","Completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    // Ensure goal belongs to this employee and is approved
    const { rows: [goal] } = await pool.query(
      "SELECT * FROM goals WHERE id=$1 AND employee_id=$2 AND status='approved'",
      [goalId, req.user.id]
    );
    if (!goal) return res.status(404).json({ error: "Approved goal not found" });

    const { rows } = await pool.query(
      `INSERT INTO achievements (goal_id, quarter, actual, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (goal_id, quarter) DO UPDATE
         SET actual=$3, status=$4, updated_at=NOW()
       RETURNING *`,
      [goalId, quarter, actual ?? null, status]
    );

    const score = computeScore(goal.uom, goal.target, actual);
    res.json({ ...rows[0], score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/achievements/:goalId  (all quarters for a goal) ──────────────
router.get("/:goalId", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM achievements WHERE goal_id=$1 ORDER BY quarter",
      [req.params.goalId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
