
const express = require('express');
const router = express.Router();

// GET /api/ingredients
router.get('/', async (req, res) => {
  const pool = req.db;
  const result = await pool.query('SELECT * FROM ingredients ORDER BY name');
  res.json(result.rows);
});

// POST /api/ingredients/adjust  -> { ingredient_id, qty, type, created_by, note }
router.post('/adjust', async (req, res) => {
  const pool = req.db;
  const { ingredient_id, qty, type, created_by, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ing = await client.query('SELECT current_qty FROM ingredients WHERE id=$1 FOR UPDATE', [ingredient_id]);
    if (ing.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({error:'ing not found'}); }
    const current = parseFloat(ing.rows[0].current_qty || 0);
    const newQty = current + parseFloat(qty);
    await client.query('UPDATE ingredients SET current_qty=$1 WHERE id=$2', [newQty, ingredient_id]);
    await client.query(`INSERT INTO inventory_transactions(ingredient_id, type, qty, unit_cost, reference_type, reference_id, created_by)
      VALUES($1,$2,$3, (SELECT cost_per_unit FROM ingredients WHERE id=$1), 'adjustment', NULL, $4)`, [ingredient_id, type, qty, created_by]);
    await client.query('COMMIT');
    res.json({ingredient_id, newQty});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({error:err.message});
  } finally { client.release(); }
});

module.exports = router;
