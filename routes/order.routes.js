const router = require('express').Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', async (req, res) => {
  try {
    const { items, deliveryType, address, paymentMethod = 'efectivo', notes = '' } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
    }
    if (!['domicilio', 'recoger'].includes(deliveryType)) {
      return res.status(400).json({ error: 'deliveryType debe ser domicilio o recoger' });
    }
    if (deliveryType === 'domicilio' && !address?.trim()) {
      return res.status(400).json({ error: 'Se requiere dirección para pedidos a domicilio' });
    }

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const resolvedAddress = deliveryType === 'domicilio' ? address.trim() : 'Recoger en tienda';

    const { rows } = await pool.query(
      `INSERT INTO orders (user_id, items, total, delivery_type, address, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, JSON.stringify(items), total, deliveryType, resolvedAddress, paymentMethod, notes]
    );
    const order = rows[0];
    req.app.get('io').emit('new_order', {
      ...order,
      user_name: req.user.name,
      user_email: req.user.email,
      user_phone: req.user.phone,
    });
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = rows[0];
    if (order.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = rows[0];
    if (order.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    if (order.status !== 'recibido') {
      return res.status(400).json({ error: 'Solo puedes cancelar un pedido recién recibido' });
    }
    const { rows: updated } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      ['cancelado', req.params.id]
    );
    req.app.get('io').emit('order_status_changed', { id: updated[0].id, status: 'cancelado' });
    res.json(updated[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  try {
    const { status } = req.body;
    const valid = ['recibido', 'en_preparacion', 'listo', 'en_reparto', 'entregado', 'cancelado'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const { rows } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
