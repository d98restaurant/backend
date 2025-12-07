const express = require('express');
const router = express.Router();

// GET all menu items
router.get('/', async (req, res) => {
  const pool = req.db;
  try {
    const result = await pool.query(`
      SELECT id, code, name, category, price, portion_size, recipe_id, is_active
      FROM menu_items
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

module.exports = router;
