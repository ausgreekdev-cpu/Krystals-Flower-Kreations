import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

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
import sitemapRoutes from './routes/sitemap.js';
// Separated routes (strengthen backend — single responsibility)
import rawMaterialsRoutes from './routes/rawMaterials.js';
import configuratorPricingRoutes from './routes/configuratorPricing.js';
import posSessionsRoutes from './routes/posSessions.js';
import posSalesRoutes from './routes/posSales.js';
import workshopSessionsRoutes from './routes/workshopSessions.js';
import bookingsRoutes from './routes/bookings.js';
import customOrderWorkflowRoutes from './routes/customOrderWorkflow.js';
import productVariantsRoutes from './routes/productVariants.js';
import collectionsRoutes from './routes/collections.js';
import reviewsRoutes from './routes/reviews.js';
import discountsRoutes, { adminDiscountsRouter } from './routes/discounts.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import shippingAdminRoutes from './routes/shippingAdmin.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';

import fs from 'fs';
import { requestLogger } from './middleware/request-log.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import { asyncHandler } from './middleware/async-handler.js';
import prisma from './lib/prisma.js';
import { validateEnv } from './lib/config.js';

validateEnv();

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
      frameSrc: ["https://js.stripe.com", "https://notebooklm.google.com", "https://*.google.com", "https://*.googleusercontent.com", "https://api.qrserver.com"],
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
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => {
  // Keep raw bytes for webhook signature verification (Meta X-Hub-Signature-256)
  if (req.originalUrl?.startsWith('/api/meta/webhook')) req.rawBody = Buffer.from(buf);
} }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static uploads (product images) — $0 local filesystem, served via /uploads.
// Resolve relative to this module so uploads work regardless of CWD.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
// Serverless filesystems (Netlify/Lambda) are read-only — never crash boot over this.
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) { console.warn(JSON.stringify({ level: 'warn', msg: 'uploads dir not writable', dir: uploadDir, code: e.code })); }
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', etag: true }));

// Health (no auth, no rate-limit beyond global) — probes the DB so monitors see real availability
app.get('/api/health', asyncHandler(async (req, res) => {
  let db = false;
  try { await prisma.$queryRaw`SELECT 1`; db = true; } catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'health db probe failed', err: e?.message })); }
  res.status(db ? 200 : 503).json({ ok: db, db, name: "Krystal's Flower Kreations", version: '1.0.0', env: process.env.NODE_ENV || 'development', requestId: req.id });
}));
app.get('/health', asyncHandler(async (req, res) => {
  let db = false;
  try { await prisma.$queryRaw`SELECT 1`; db = true; } catch {}
  res.status(db ? 200 : 503).json({ status: db ? 'healthy' : 'unhealthy', db, timestamp: new Date().toISOString(), version: '1.0.0', requestId: req.id });
}));

// Routes — apply stricter per-route rate limits where needed inside routers
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/posts', blogRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/bom', bomRoutes); // legacy monolith kept for compat
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api', sitemapRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/meta', metaRoutes);

// Separated routes — single responsibility (new, preferred)
app.use('/api/materials', rawMaterialsRoutes); // was /api/bom/materials
app.use('/api/configurator', configuratorPricingRoutes); // was /api/bom/live
app.use('/api/pos/sessions', posSessionsRoutes); // was /api/pos/session/*
app.use('/api/pos/sales', posSalesRoutes); // was /api/pos/sale
app.use('/api/workshop-sessions', workshopSessionsRoutes); // was /api/workshops/:id/sessions
app.use('/api/bookings', bookingsRoutes); // was /api/workshops/sessions/:id/book + tickets
app.use('/api/custom-orders/workflow', customOrderWorkflowRoutes); // kanban + state
app.use('/api/variants', productVariantsRoutes); // was implicit in products
app.use('/api/collections', collectionsRoutes); // was inline below (now via file, keep compat alias)
app.use('/api/reviews', reviewsRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api/discounts/admin', adminDiscountsRouter);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/shipping', shippingAdminRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);

// Stripe webhook (raw body needed — keep before json parser if you re-enable, currently json-parsed; stripe disabled)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  res.json({ received: true, note: 'Stripe disabled — manual payments active' });
});

// 404 + error (structured codes)
app.use('/api', notFound);
app.use(errorHandler);

export default app;
