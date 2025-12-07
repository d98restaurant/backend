const express = require('express');
const router = express.Router();

// GET /api/menu_items
router.get('/', async (req, res) => {
  try {
    const pool = req.db;
    const result = await pool.query(`
      SELECT id, code, name, category, price, portion_size, recipe_id, is_active
      FROM menu_items
      ORDER BY name ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Menu items error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;
