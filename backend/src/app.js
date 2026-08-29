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
import bomRoutes from './routes/bom.js';
import customOrderRoutes from './routes/customOrders.js';
import ticketRoutes from './routes/tickets.js';
import loyaltyRoutes from './routes/loyalty.js';

import { requestLogger } from './middleware/request-log.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import prisma from './lib/prisma.js';
import { authenticate, roleAtLeast } from './lib/auth.js';

const app = express();

// Security headers — CSP enabled (was disabled in LUX), allow self + Stripe + Supabase
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.stripe.com", "https://*.stripe.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — explicit origin list, no credentials needed (Bearer header)
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://krystalsflowerkreations.netlify.app',
  'capacitor://localhost',
  'http://localhost',
];
const corsOrigin = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s=>s.trim()) : defaultOrigins;
app.use(cors({ origin: corsOrigin, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Request-Id','X-Cart-Id','Idempotency-Key'] }));

app.use(requestLogger);
app.use('/api', globalRateLimit(300, 1));

// Body parsers — json 1mb (was 10mb) to limit abuse; multer handles file uploads separately
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health (no auth, no rate-limit beyond global)
app.get('/api/health', (req, res) => res.json({ ok: true, name: "Krystal's Flower Kreations", version: '1.0.0', env: process.env.NODE_ENV || 'development', requestId: req.id }));
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0', requestId: req.id }));

// Routes — apply stricter per-route rate limits where needed inside routers
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/posts', blogRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/bom', bomRoutes);
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/meta', metaRoutes);

// Collections (thin)
app.get('/api/collections', async (req, res, next) => {
  try {
    const cols = await prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { products: { include: { product: { include: { images: true } } } } } });
    res.json(cols);
  } catch (err) { next(err); }
});
app.post('/api/collections', authenticate, roleAtLeast('maker'), async (req, res, next) => {
  try {
    const col = await prisma.collection.create({ data: req.body });
    res.status(201).json(col);
  } catch (err) { next(err); }
});

// Stripe webhook (raw body needed — keep before json parser if you re-enable, currently json-parsed; stripe disabled)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  res.json({ received: true, note: 'Stripe disabled — manual payments active' });
});

// 404 + error (structured codes)
app.use('/api', notFound);
app.use(errorHandler);

export default app;
