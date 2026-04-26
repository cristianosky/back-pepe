const router = require('express').Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/role');
const { notifyOrderStatus } = require('../utils/push');

router.use(authMiddleware);
router.use(roleMiddleware('admin', 'cocinero'));

const NEXT = { recibido: 'en_preparacion', en_preparacion: 'listo' };

router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, items, notes, status, delivery_type, created_at
       FROM orders
       WHERE status IN ('recibido', 'en_preparacion')
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/orders/:id/next', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    const next = NEXT[rows[0].status];
    if (!next) return res.status(400).json({ error: 'El pedido no se puede avanzar desde cocina' });

    const { rows: updated } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [next, req.params.id]
    );
    req.app.get('io').emit('order_status_changed', { id: updated[0].id, status: next });
    notifyOrderStatus(pool, updated[0].id, next);
    res.json(updated[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
