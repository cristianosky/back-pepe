const router = require('express').Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/role');

router.use(authMiddleware);
router.use(roleMiddleware('admin', 'repartidor'));

router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.items, o.notes, o.status, o.delivery_type, o.address, o.total, o.created_at,
              u.name AS user_name, u.phone AS user_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.status IN ('listo', 'en_reparto') AND o.delivery_type = 'domicilio'
       ORDER BY o.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/orders/:id/pickup', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = 'en_reparto'
       WHERE id = $1 AND status = 'listo' AND delivery_type = 'domicilio'
       RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado o no disponible' });
    req.app.get('io').emit('order_status_changed', { id: rows[0].id, status: 'en_reparto' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/orders/:id/delivered', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = 'entregado'
       WHERE id = $1 AND status = 'en_reparto' AND delivery_type = 'domicilio'
       RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado o no disponible' });
    req.app.get('io').emit('order_status_changed', { id: rows[0].id, status: 'entregado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
