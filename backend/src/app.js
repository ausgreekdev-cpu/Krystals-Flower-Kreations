import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import blogRoutes from './routes/blog.js';
import workshopRoutes from './routes/workshops.js';
import inventoryRoutes from './routes/inventory.js';
import posRoutes from './routes/pos.js';
import metaRoutes from './routes/meta.js';

const app = express();

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, name: "Krystal's Flower Kreations", version: '0.1.0', env: process.env.NODE_ENV }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/posts', blogRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/meta', metaRoutes);

// Collections (thin)
import prisma from './lib/prisma.js';
app.get('/api/collections', async (req, res) => {
  const cols = await prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { products: { include: { product: { include: { images: true } } } } } });
  res.json(cols);
});
app.post('/api/collections', async (req, res) => {
  const col = await prisma.collection.create({ data: req.body });
  res.status(201).json(col);
});

// Stripe webhook (raw body needed — keep before json parser if you move it)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // verify signature with STRIPE_WEBHOOK_SECRET, update order status
  res.json({ received: true });
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// Error
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

export default app;
