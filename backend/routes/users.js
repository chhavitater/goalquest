// routes/users.js
const router = require("express").Router();
const pool = require("../db/pool");
const { auth, requireRole } = require("../middleware/auth");

// GET /api/users/team  – manager fetches their direct reports
router.get("/team", auth, requireRole("manager", "admin"), async (req, res) => {
  try {
    const managerId = req.user.role === "admin" ? req.query.manager_id : req.user.id;
    const { rows } = await pool.query(
      "SELECT id, name, email, department, role FROM users WHERE manager_id = $1 ORDER BY name",
      [managerId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users  – admin fetches everyone
router.get("/", auth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department,
              m.name AS manager_name
       FROM users u LEFT JOIN users m ON m.id = u.manager_id ORDER BY u.role, u.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
