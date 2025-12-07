
const express = require('express');
const router = express.Router();

// POST /api/orders
// Body: { order_type, table_no, customer_name, items: [{menu_item_id, qty}] , created_by }
router.post('/', async (req, res) => {
  const pool = req.db;
  const client = await pool.connect();
  try {
    const { order_type, table_no, customer_name, items, created_by } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({error:'No items'});

    await client.query('BEGIN');

    const orderInsert = await client.query(
      `INSERT INTO orders(order_type, table_no, customer_name, status, total_amount, created_by)
       VALUES($1,$2,$3,'placed',0,$4) RETURNING id, created_at`, [order_type, table_no, customer_name, created_by]
    );
    const orderId = orderInsert.rows[0].id;
    let orderTotal = 0;

    for (const it of items) {
      const menu = await client.query('SELECT id, name, price, recipe_id FROM menu_items WHERE id=$1 FOR SHARE', [it.menu_item_id]);
      if (menu.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({error:`Menu item id ${it.menu_item_id} not found`});
      }
      const menuRow = menu.rows[0];
      const qty = parseInt(it.qty || 1);

      await client.query(
        `INSERT INTO order_items(order_id, menu_item_id, qty, price)
         VALUES($1,$2,$3,$4)`, [orderId, menuRow.id, qty, menuRow.price]
      );
      orderTotal += parseFloat(menuRow.price) * qty;

      // Load recipe items
      const recipeItems = await client.query(
        `SELECT ri.ingredient_id, ri.qty, ri.wastage_pct, ing.current_qty
         FROM recipe_items ri
         JOIN ingredients ing ON ing.id = ri.ingredient_id
         WHERE ri.recipe_id = $1`, [menuRow.recipe_id]
      );

      for (const ri of recipeItems.rows) {
        // required qty scaled by ordered qty
        const wasteFactor = ri.wastage_pct ? (1 + parseFloat(ri.wastage_pct)/100.0) : 1;
        const requiredQty = parseFloat(ri.qty) * qty * wasteFactor;

        // Lock ingredient row
        const ingRow = await client.query('SELECT current_qty, reorder_level FROM ingredients WHERE id=$1 FOR UPDATE', [ri.ingredient_id]);
        if (ingRow.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({error:'Ingredient not found id '+ri.ingredient_id});
        }
        const current = parseFloat(ingRow.rows[0].current_qty || 0);
        if (current < requiredQty) {
          await client.query('ROLLBACK');
          return res.status(400).json({error:`Insufficient stock for ingredient id ${ri.ingredient_id}`});
        }
        const newQty = current - requiredQty;
        await client.query('UPDATE ingredients SET current_qty=$1 WHERE id=$2', [newQty, ri.ingredient_id]);
        await client.query(
          `INSERT INTO inventory_transactions(ingredient_id, type, qty, unit_cost, reference_type, reference_id, created_by)
           VALUES($1,'usage',$2, (SELECT cost_per_unit FROM ingredients WHERE id=$1), 'order', $3, $4)`,
          [ri.ingredient_id, requiredQty, orderId, created_by]
        );
        // create alert if under reorder
        if (newQty <= parseFloat(ingRow.rows[0].reorder_level || 0)) {
          await client.query(`INSERT INTO stock_alerts(ingredient_id, alert_qty) VALUES($1,$2)`, [ri.ingredient_id, newQty]);
        }
      }
    }

    await client.query('UPDATE orders SET total_amount=$1 WHERE id=$2', [orderTotal, orderId]);
    await client.query('COMMIT');
    res.json({order_id: orderId, total: orderTotal});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('order error', err);
    res.status(500).json({error: 'Server error', detail: err.message});
  } finally {
    client.release();
  }
});

module.exports = router;
