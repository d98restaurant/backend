
const express = require('express');
const router = express.Router();

// POST /api/purchases
// body: { vendor_id, invoice_no, items: [{ingredient_id, qty, cost_per_unit}], created_by }
router.post('/', async (req, res) => {
  const pool = req.db;
  const client = await pool.connect();
  try {
    const { vendor_id, invoice_no, items, created_by } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({error:'no items'});
    await client.query('BEGIN');
    const insert = await client.query(
      `INSERT INTO purchases(vendor_id, invoice_no, date, total_amount, created_by)
       VALUES($1,$2,now(),0,$3) RETURNING id`, [vendor_id, invoice_no, created_by]
    );
    const purchaseId = insert.rows[0].id;
    let total = 0;
    for (const it of items) {
      const amt = parseFloat(it.qty) * parseFloat(it.cost_per_unit);
      total += amt;
      await client.query(`INSERT INTO purchase_items(purchase_id, ingredient_id, qty, cost_per_unit)
        VALUES($1,$2,$3,$4)`, [purchaseId, it.ingredient_id, it.qty, it.cost_per_unit]);
      // update ingredient stock and cost_per_unit
      const ing = await client.query('SELECT current_qty FROM ingredients WHERE id=$1 FOR UPDATE', [it.ingredient_id]);
      if (ing.rowCount === 0) {
        await client.query('ROLLBACK'); return res.status(400).json({error:'ingredient not found '+it.ingredient_id});
      }
      const newQty = parseFloat(ing.rows[0].current_qty || 0) + parseFloat(it.qty);
      await client.query('UPDATE ingredients SET current_qty=$1, cost_per_unit=$2 WHERE id=$3', [newQty, it.cost_per_unit, it.ingredient_id]);
      await client.query(`INSERT INTO inventory_transactions(ingredient_id, type, qty, unit_cost, reference_type, reference_id, created_by)
        VALUES($1,'purchase',$2,$3,'purchase',$4,$5)`, [it.ingredient_id, it.qty, it.cost_per_unit, purchaseId, created_by]);
    }
    await client.query('UPDATE purchases SET total_amount=$1 WHERE id=$2', [total, purchaseId]);
    await client.query('COMMIT');
    res.json({purchaseId, total});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({error:err.message});
  } finally { client.release(); }
});

module.exports = router;
