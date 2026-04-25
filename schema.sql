-- Schema para Pepe Food and Drink
-- Ejecutar: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(30)  DEFAULT '',
  addresses     JSONB        DEFAULT '[]',
  role          VARCHAR(10)  DEFAULT 'user' CHECK (role IN ('user', 'admin', 'cocinero', 'repartidor')),
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Migración idempotente para BD existente
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(10) DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'cocinero', 'repartidor'));

CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  image      TEXT         DEFAULT '',
  sort_order INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  description TEXT         DEFAULT '',
  price       INTEGER      NOT NULL,  -- precio en COP (pesos enteros)
  category_id UUID         REFERENCES categories(id) ON DELETE SET NULL,
  image       TEXT         DEFAULT '',
  available   BOOLEAN      DEFAULT TRUE,
  featured    BOOLEAN      DEFAULT FALSE,
  extras      JSONB        DEFAULT '[]',  -- [{name, price}]
  sizes       JSONB        DEFAULT '[]',  -- [{label, priceModifier}]
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items           JSONB       NOT NULL,   -- snapshot de los ítems al momento del pedido
  total           INTEGER     NOT NULL,   -- COP
  status          VARCHAR(20) NOT NULL DEFAULT 'recibido'
                              CHECK (status IN ('recibido','en_preparacion','listo','en_reparto','entregado','cancelado')),
  delivery_type   VARCHAR(10) NOT NULL CHECK (delivery_type IN ('domicilio','recoger')),
  address         TEXT        DEFAULT '',
  payment_method  VARCHAR(10) DEFAULT 'efectivo' CHECK (payment_method IN ('efectivo','tarjeta')),
  notes           TEXT        DEFAULT '',
  estimated_time  INTEGER     DEFAULT 30,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger updated_at para users
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated_at') THEN
    CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at') THEN
    CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Migraciones idempotentes para BD existente
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ALTER COLUMN payment_method TYPE VARCHAR(20);
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('efectivo','tarjeta','nequi','transferencia'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('recibido','en_preparacion','listo','en_reparto','entregado','cancelado'));
