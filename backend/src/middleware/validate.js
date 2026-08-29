import { z } from 'zod';

// Central strict schemas — finite numbers, max lengths, strict objects
export const schemas = {
  login: z.object({ email: z.string().email().max(254), password: z.string().min(6).max(128) }).strict(),
  register: z.object({ name: z.string().min(2).max(100), email: z.string().email().max(254), password: z.string().min(6).max(128), phone: z.string().max(30).optional() }).strict(),
  product: z.object({
    title: z.string().min(2).max(200),
    slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
    description: z.string().max(10000).optional(),
    type: z.enum(['physical','made_to_order','digital_template','workshop_ticket','commission']).default('physical'),
    stockMode: z.enum(['tracked','made_to_order','digital']).default('tracked'),
    price: z.number().finite().nonnegative().max(1000000),
    compareAtPrice: z.number().finite().nonnegative().max(1000000).optional().nullable(),
    cost: z.number().finite().nonnegative().max(1000000).optional().nullable(),
    sku: z.string().max(50).optional().nullable(),
    weightGrams: z.number().int().finite().min(0).max(100000).optional().nullable(),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    paperStock: z.string().max(200).optional().nullable(),
    cricutCompatible: z.boolean().default(false),
    madeToOrderDays: z.number().int().finite().min(0).max(90).optional().nullable(),
  }).strict(),
  cartAdd: z.object({
    productId: z.string().cuid().or(z.string().uuid()).or(z.string().min(8).max(100)),
    variantId: z.string().cuid().or(z.string().uuid()).or(z.string().min(8).max(100)).optional().nullable(),
    quantity: z.number().int().finite().min(1).max(99),
    cartId: z.string().optional().nullable(),
  }).strict(),
  checkout: z.object({
    cartId: z.string().min(8).max(100),
    email: z.string().email().max(254),
    phone: z.string().max(30).optional(),
    shippingName: z.string().min(2).max(120),
    shippingAddress: z.string().min(5).max(500),
    shippingSuburb: z.string().min(2).max(100),
    shippingState: z.string().min(2).max(50).default('WA'),
    shippingPostcode: z.string().min(3).max(10).regex(/^[0-9A-Za-z ]+$/),
    discountCode: z.string().max(30).optional().nullable(),
    customerNote: z.string().max(2000).optional().nullable(),
    paymentMethod: z.enum(['cash','bank_transfer','pickup','manual']).default('manual'),
  }).strict(),
  workshopBook: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(254),
    phone: z.string().max(30).optional(),
    quantity: z.number().int().min(1).max(10).default(1),
    kitAddOn: z.boolean().default(false),
    totalPaid: z.number().finite().nonnegative().max(100000).optional(),
  }).strict(),
  customOrder: z.object({
    customerEmail: z.string().email().max(254),
    customerName: z.string().min(1).max(120),
    customerPhone: z.string().max(30).optional().nullable(),
    productId: z.string().optional().nullable(),
    variantId: z.string().optional().nullable(),
    spec: z.object({
      paperColor: z.string().min(1).max(50),
      paperTexture: z.string().min(1).max(50),
      weight: z.string().min(1).max(20),
      stemCount: z.number().int().min(1).max(25),
      armatureHeightMm: z.number().int().min(50).max(800),
      templateId: z.string().min(1).max(100),
      addGreenery: z.boolean().default(false),
      vaseIncluded: z.boolean().default(false),
      notes: z.string().max(2000).optional().nullable(),
    }).strict(),
    shippingName: z.string().max(120).optional().nullable(),
    shippingAddress: z.string().max(500).optional().nullable(),
    shippingSuburb: z.string().max(100).optional().nullable(),
    shippingState: z.string().max(50).default('WA'),
    shippingPostcode: z.string().max(10).optional().nullable(),
  }).strict(),
};

// Body validator — strict, finite, max lengths
export function validate(schema) {
  // Allow passing Zod object directly or schema name string
  const zodSchema = typeof schema === 'string' ? schemas[schema] : schema;
  if (!zodSchema) {
    throw new Error(`Unknown validation schema: ${schema}`);
  }
  return (req, res, next) => {
    const parsed = zodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', code: 'validation_failed', details: parsed.error.flatten() });
    }
    req.validated = parsed.data;
    next();
  };
}

// Query validator — for pagination/search
export function validateQuery(schema) {
  const zodSchema = typeof schema === 'string' ? schemas[schema] : schema;
  if (!zodSchema) throw new Error(`Unknown query schema: ${schema}`);
  return (req, res, next) => {
    const parsed = zodSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', code: 'invalid_query', details: parsed.error.flatten() });
    }
    req.validatedQuery = parsed.data;
    next();
  };
}

// Params validator
export function validateParams(schema) {
  const zodSchema = typeof schema === 'string' ? schemas[schema] : schema;
  if (!zodSchema) throw new Error(`Unknown params schema: ${schema}`);
  return (req, res, next) => {
    const parsed = zodSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid params', code: 'invalid_params', details: parsed.error.flatten() });
    }
    req.validatedParams = parsed.data;
    next();
  };
}

// Common query schemas
export const querySchemas = {
  pagination: z.object({
    page: z.coerce.number().int().finite().min(1).max(1000).default(1),
    limit: z.coerce.number().int().finite().min(1).max(100).default(24),
    q: z.string().max(200).optional(),
    cursor: z.string().max(100).optional(),
  }),
  products: z.object({
    q: z.string().max(200).optional(),
    collection: z.string().max(100).optional(),
    featured: z.enum(['true','false']).optional(),
    type: z.enum(['physical','made_to_order','digital_template','workshop_ticket','commission']).optional(),
    limit: z.coerce.number().int().finite().min(1).max(100).default(24),
    cursor: z.string().max(100).optional(),
  }),
};

export default validate;
