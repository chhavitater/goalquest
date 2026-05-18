// routes/checkins.js
const router = require("express").Router();
const pool = require("../db/pool");
const { auth, requireRole } = require("../middleware/auth");

// ── POST /api/checkins/:goalId/:quarter  (manager adds comment) ────────────
router.post("/:goalId/:quarter", auth, requireRole("manager", "admin"), async (req, res) => {
  const { goalId, quarter } = req.params;
  const { comment } = req.body;

  if (!comment?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });
  if (!["Q1","Q2","Q3","Q4"].includes(quarter)) return res.status(400).json({ error: "Invalid quarter" });

  try {
    if (req.user.role === "manager") {
      // Verify goal belongs to a team member
      const { rows: [goal] } = await pool.query(
        `SELECT g.id FROM goals g JOIN users u ON u.id = g.employee_id
         WHERE g.id=$1 AND u.manager_id=$2`,
        [goalId, req.user.id]
      );
      if (!goal) return res.status(403).json({ error: "Goal not in your team" });
    }

    const { rows } = await pool.query(
      `INSERT INTO checkin_comments (goal_id, quarter, manager_id, comment)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [goalId, quarter, req.user.id, comment.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/checkins/:goalId  (all comments for a goal) ──────────────────
router.get("/:goalId", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cc.*, u.name AS manager_name
       FROM checkin_comments cc JOIN users u ON u.id = cc.manager_id
       WHERE cc.goal_id=$1 ORDER BY cc.created_at DESC`,
      [req.params.goalId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
