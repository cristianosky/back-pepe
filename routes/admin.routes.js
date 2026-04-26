const router = require('express').Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { notifyOrderStatus } = require('../utils/push');

const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(adminMiddleware);

router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
  const url = `${req.protocol}://${req.get('host')}/uploads/products/${req.file.filename}`;
  res.json({ url });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const [ordersToday, revenueToday, byStatus, topProduct] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE created_at::date = CURRENT_DATE`),
      pool.query(`SELECT COALESCE(SUM(total), 0)::int AS total FROM orders WHERE created_at::date = CURRENT_DATE AND status != 'cancelado'`),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status ORDER BY count DESC`),
      pool.query(`
        SELECT item->>'product_name' AS name, SUM((item->>'quantity')::int) AS qty
        FROM orders, jsonb_array_elements(items) AS item
        GROUP BY name ORDER BY qty DESC LIMIT 1
      `),
    ]);
    res.json({
      ordersToday: ordersToday.rows[0].count,
      revenueToday: revenueToday.rows[0].total,
      byStatus: byStatus.rows,
      topProduct: topProduct.rows[0] ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pedidos ──────────────────────────────────────────────────────────────────

router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    const values = [];
    let where = '';
    if (status) {
      values.push(status);
      where = 'WHERE o.status = $1';
    }
    const { rows } = await pool.query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ${where}
       ORDER BY o.created_at DESC`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/orders/:id/status', async (req, res) => {
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

    req.app.get('io').emit('order_status_changed', { id: rows[0].id, status: rows[0].status });

    notifyOrderStatus(pool, rows[0].id, status);

    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Productos ─────────────────────────────────────────────────────────────────

router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order ASC NULLS LAST, p.name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const {
      name, description = '', price, category_id,
      image = '', available = true, featured = false,
      extras = [], sizes = [],
    } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name y price son requeridos' });
    }
    const { rows } = await pool.query(
      `INSERT INTO products
         (name, description, price, category_id, image, available, featured, extras, sizes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        name.trim(), description, Number(price),
        category_id || null, image,
        available, featured,
        JSON.stringify(extras), JSON.stringify(sizes),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const { name, description, price, category_id, image, available, featured, extras, sizes } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined)        { fields.push(`name = $${idx++}`);        values.push(name.trim()); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (price !== undefined)       { fields.push(`price = $${idx++}`);       values.push(Number(price)); }
    if (category_id !== undefined) { fields.push(`category_id = $${idx++}`); values.push(category_id || null); }
    if (image !== undefined)       { fields.push(`image = $${idx++}`);       values.push(image); }
    if (available !== undefined)   { fields.push(`available = $${idx++}`);   values.push(available); }
    if (featured !== undefined)    { fields.push(`featured = $${idx++}`);    values.push(featured); }
    if (extras !== undefined)      { fields.push(`extras = $${idx++}`);      values.push(JSON.stringify(extras)); }
    if (sizes !== undefined)       { fields.push(`sizes = $${idx++}`);       values.push(JSON.stringify(sizes)); }

    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    await pool.query('UPDATE products SET available = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff ─────────────────────────────────────────────────────────────────────

router.get('/staff', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, created_at
       FROM users WHERE role IN ('cocinero', 'repartidor')
       ORDER BY role, name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staff', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password y role son requeridos' });
    }
    if (!['cocinero', 'repartidor'].includes(role)) {
      return res.status(400).json({ error: 'role debe ser cocinero o repartidor' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'El email ya está registrado' });

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase().trim(), password_hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/staff/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role IN ('cocinero', 'repartidor') RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
