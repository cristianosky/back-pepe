require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pepe_food',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM categories');
    await client.query('DELETE FROM users');
    console.log('Tablas limpiadas');

    // Categorías
    const { rows: cats } = await client.query(`
      INSERT INTO categories (name, slug, sort_order, image) VALUES
        ('Burgers',  'burgers', 1, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'),
        ('Bebidas',  'bebidas', 2, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'),
        ('Snacks',   'snacks',  3, 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=400'),
        ('Combos',   'combos',  4, 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400')
      RETURNING id, slug
    `);
    const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
    console.log(`${cats.length} categorías creadas`);

    // Productos
    const products = [
      {
        name: 'Pepe Burger Clásica',
        description: 'Carne de res 200g, lechuga, tomate, cebolla caramelizada, queso cheddar y salsa especial de la casa.',
        price: 22000,
        category: 'burgers',
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
        featured: true,
        extras: [{ name: 'Queso extra', price: 3000 }, { name: 'Bacon', price: 4500 }, { name: 'Aguacate', price: 4000 }],
        sizes: [{ label: 'Sencilla', priceModifier: 0 }, { label: 'Doble', priceModifier: 8000 }],
      },
      {
        name: 'Pepe Burger BBQ',
        description: 'Carne de res 200g, aros de cebolla, jalapeños, queso gouda ahumado y salsa BBQ artesanal.',
        price: 26000,
        category: 'burgers',
        image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600',
        featured: true,
        extras: [{ name: 'Queso extra', price: 3000 }, { name: 'Jalapeños extra', price: 2000 }],
        sizes: [{ label: 'Sencilla', priceModifier: 0 }, { label: 'Doble', priceModifier: 8000 }],
      },
      {
        name: 'Pepe Chicken Burger',
        description: 'Pechuga de pollo apanada crujiente, coleslaw casero, pepinillo y mayonesa de limón.',
        price: 21000,
        category: 'burgers',
        image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=600',
        featured: false,
        extras: [{ name: 'Queso extra', price: 3000 }, { name: 'Aguacate', price: 4000 }],
        sizes: [{ label: 'Sencilla', priceModifier: 0 }, { label: 'Doble', priceModifier: 7000 }],
      },
      {
        name: 'Gaseosa 400ml',
        description: 'Coca-Cola, Pepsi, Sprite o 7UP. Fría y burbujeante para acompañar tu pedido.',
        price: 5000,
        category: 'bebidas',
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600',
        featured: false,
        extras: [],
        sizes: [{ label: '400ml', priceModifier: 0 }, { label: '750ml', priceModifier: 3000 }],
      },
      {
        name: 'Limonada de Coco',
        description: 'Limonada natural con leche de coco, hielo triturado y toque de menta. Nuestra especialidad.',
        price: 9000,
        category: 'bebidas',
        image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600',
        featured: true,
        extras: [{ name: 'Shot de vodka', price: 6000 }],
        sizes: [],
      },
      {
        name: 'Papas Fritas Pepe',
        description: 'Papas crinkle-cut fritas en aceite de girasol, sal marina y nuestro seasoning secreto.',
        price: 10000,
        category: 'snacks',
        image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=600',
        featured: false,
        extras: [{ name: 'Queso fundido', price: 4000 }, { name: 'Salsa trufa', price: 5000 }, { name: 'Bacon bits', price: 4000 }],
        sizes: [{ label: 'Mediana', priceModifier: 0 }, { label: 'Grande', priceModifier: 4000 }],
      },
      {
        name: 'Aros de Cebolla',
        description: 'Aros de cebolla dulce apanados en cerveza, crujientes y dorados. Perfectos para compartir.',
        price: 12000,
        category: 'snacks',
        image: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=600',
        featured: false,
        extras: [{ name: 'Salsa ranch extra', price: 2000 }],
        sizes: [],
      },
      {
        name: 'Combo Pepe Clásico',
        description: 'Pepe Burger Clásica + Papas Fritas medianas + Gaseosa 400ml. Todo lo que necesitas en un solo pedido.',
        price: 34000,
        category: 'combos',
        image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600',
        featured: true,
        extras: [{ name: 'Agrandar papas', price: 4000 }, { name: 'Agrandar gaseosa', price: 3000 }, { name: 'Añadir postre', price: 7000 }],
        sizes: [],
      },
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO products (name, description, price, category_id, image, featured, extras, sizes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.name, p.description, p.price, catId[p.category], p.image, p.featured,
          JSON.stringify(p.extras), JSON.stringify(p.sizes)]
      );
    }
    console.log(`${products.length} productos creados`);

    // Usuario de prueba (admin)
    const password_hash = await bcrypt.hash('123456', 12);
    await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5)`,
      ['Admin Pepe', 'admin@pepefood.com', password_hash, '3001234567', 'admin']
    );
    console.log('Usuario de prueba: admin@pepefood.com / 123456 (rol: admin)');

    await client.query('COMMIT');
    console.log('Seed completado exitosamente');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
