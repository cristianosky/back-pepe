const STATUS_MESSAGES = {
  en_preparacion: 'Tu pedido está siendo preparado 👨‍🍳',
  listo: '¡Tu pedido está listo para entregar! 🎉',
  en_reparto: '¡Tu pedido va en camino! 🛵',
  entregado: '¡Tu pedido fue entregado! ✅',
  cancelado: 'Tu pedido fue cancelado ❌',
};

async function sendPush(pushToken, title, body, data = {}) {
  if (!pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, sound: 'default', title, body, data }),
    });
  } catch {}
}

async function notifyOrderStatus(pool, orderId, status) {
  if (!STATUS_MESSAGES[status]) return;
  try {
    const { rows } = await pool.query(
      'SELECT u.push_token FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1',
      [orderId]
    );
    sendPush(rows[0]?.push_token, 'Pepe Food & Drink 🍔', STATUS_MESSAGES[status], { orderId });
  } catch {}
}

async function notifyStaffNewOrder(pool, order, userName) {
  try {
    const { rows } = await pool.query(
      "SELECT push_token FROM users WHERE role IN ('admin', 'cocinero') AND push_token IS NOT NULL"
    );
    const body = `Nuevo pedido de ${userName} 🛎️`;
    rows.forEach(({ push_token }) =>
      sendPush(push_token, 'Pepe Food & Drink 🍔', body, { orderId: order.id })
    );
  } catch {}
}

module.exports = { sendPush, notifyOrderStatus, notifyStaffNewOrder };
