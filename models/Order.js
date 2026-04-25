const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  size: { type: String, default: null },
  extras: [{ name: String, price: Number }],
  subtotal: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado'],
      default: 'recibido',
    },
    deliveryType: {
      type: String,
      enum: ['domicilio', 'recoger'],
      required: true,
    },
    address: { type: String, default: '' },
    paymentMethod: {
      type: String,
      enum: ['efectivo', 'tarjeta'],
      default: 'efectivo',
    },
    notes: { type: String, default: '' },
    estimatedTime: { type: Number, default: 30 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
