// OpenAPI 3.0 spec for Krystal's Flower Kreations API.
// Served at GET /api/docs (JSON) and GET /api/docs/ui (Swagger UI).
const spec = {
  openapi: '3.0.3',
  info: {
    title: "Krystal's Flower Kreations API",
    version: '1.0.0',
    description: 'Custom paper florist & sculptural art workshop — e-commerce, studio ops, inventory, BOM, procedures, documents, and more.',
    contact: { name: 'Krystal Flower Kreations', email: 'krystal@flowerkreations.com.au' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local dev' },
    { url: 'https://krystalsflowercreations.com.au', description: 'Production' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' }, requestId: { type: 'string' } } },
      Product: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, slug: { type: 'string' }, price: { type: 'number' }, type: { type: 'string' }, stockMode: { type: 'string' }, isActive: { type: 'boolean' }, procedureDocumentId: { type: 'string', nullable: true } } },
      Order: { type: 'object', properties: { id: { type: 'string' }, orderNumber: { type: 'string' }, status: { type: 'string' }, paymentStatus: { type: 'string' }, total: { type: 'number' }, qcStatus: { type: 'string', nullable: true }, productionRunId: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } },
      RawMaterial: { type: 'object', properties: { id: { type: 'string' }, sku: { type: 'string' }, name: { type: 'string' }, unit: { type: 'string' }, onHand: { type: 'number' }, lowThreshold: { type: 'number' }, costPerUnit: { type: 'number' }, procurementStatus: { type: 'string' }, suggestedSupplier: { type: 'string', nullable: true } } },
      ProcedureDocument: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, category: { type: 'string' }, subcategory: { type: 'string', nullable: true }, version: { type: 'string' }, status: { type: 'string' }, metadata: { type: 'object' }, products: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } },
      BOMRecipe: { type: 'object', properties: { id: { type: 'string' }, productId: { type: 'string', nullable: true }, variantId: { type: 'string', nullable: true }, templateId: { type: 'string', nullable: true }, version: { type: 'string' }, labourMinutesPerUnit: { type: 'number' }, cricutMinutesPerUnit: { type: 'number' }, lines: { type: 'array' } } },
      Supplier: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, contact: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, isActive: { type: 'boolean' } } },
      StudioHealth: { type: 'object', properties: { orders: { type: 'object' }, revenue: { type: 'object' }, inventory: { type: 'object' }, operations: { type: 'object' }, catalog: { type: 'object' }, customers: { type: 'object' }, alerts: { type: 'array' }, recentOrders: { type: 'array' }, generatedAt: { type: 'string', format: 'date-time' } } },
      Agent: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, systemPrompt: { type: 'string' }, mode: { type: 'string' }, tools: { type: 'array', items: { type: 'string' } }, model: { type: 'string', nullable: true }, isActive: { type: 'boolean' } } },
      Skill: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, content: { type: 'string' }, triggers: { type: 'array', items: { type: 'string' } }, isActive: { type: 'boolean' } } },
      Workflow: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, steps: { type: 'array' }, isActive: { type: 'boolean' } } },
      Automation: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, trigger: { type: 'string' }, triggerType: { type: 'string' }, action: { type: 'string' }, actionType: { type: 'string' }, isActive: { type: 'boolean' } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {},
};

// ── Auth ──────────────────────────────────────────────────────────────
spec.paths['/api/auth/login'] = {
  post: { summary: 'Login', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } } }, responses: { 200: { description: 'JWT token + user' }, 401: { description: 'Invalid credentials' } } },
};

// ── Products ──────────────────────────────────────────────────────────
spec.paths['/api/products'] = {
  get: { summary: 'List products', tags: ['Products'], parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Product list' } } },
  post: { summary: 'Create product', tags: ['Products'], security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } }, responses: { 201: { description: 'Created' } } },
};

// ── Orders ────────────────────────────────────────────────────────────
spec.paths['/api/orders'] = {
  get: { summary: 'List orders', tags: ['Orders'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Order list' } } },
  post: { summary: 'Create order (checkout)', tags: ['Orders'], responses: { 201: { description: 'Order created' } } },
};
spec.paths['/api/orders/{id}/status'] = {
  patch: { summary: 'Update order status', tags: ['Orders'], security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, note: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' }, 409: { description: 'Invalid transition' } } },
};
spec.paths['/api/orders/{id}/qc'] = {
  patch: { summary: 'QC checkpoint', tags: ['Orders'], security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { qcStatus: { type: 'string', enum: ['pending', 'passed', 'failed'] }, qcNotes: { type: 'string' }, qcPhotoUrl: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' } } },
};
spec.paths['/api/orders/{id}/fulfill'] = {
  post: { summary: 'Unified fulfillment workflow', tags: ['Orders'], security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Fulfillment result with step details' } } },
};

// ── Inventory ─────────────────────────────────────────────────────────
spec.paths['/api/inventory/levels'] = { get: { summary: 'List inventory levels', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Levels' } } } };
spec.paths['/api/inventory/low-stock'] = { get: { summary: 'Low stock items', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Low stock list' } } } };
spec.paths['/api/inventory/rebalance'] = { get: { summary: 'Transfer suggestions', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Rebalance suggestions' } } } };
spec.paths['/api/inventory/adjust'] = { post: { summary: 'Adjust stock', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } } };
spec.paths['/api/inventory/transfer'] = { post: { summary: 'Transfer stock between locations', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Transferred' } } } };

// ── BOM ──────────────────────────────────────────────────────────────
spec.paths['/api/bom/recipes'] = { get: { summary: 'List BOM recipes', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Recipes' } } }, post: { summary: 'Create/update recipe', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/bom/recipes/{id}'] = { get: { summary: 'Get recipe', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Recipe' } } }, patch: { summary: 'Update recipe', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } } };
spec.paths['/api/bom/recipes/{id}/revisions'] = { get: { summary: 'Recipe revision history', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Revisions' } } } };
spec.paths['/api/bom/materials/{id}/substitutes'] = { get: { summary: 'Suggest substitutes', tags: ['BOM'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Substitute materials' } } } };

// ── Procedures ────────────────────────────────────────────────────────
spec.paths['/api/procedures'] = { get: { summary: 'List procedures', tags: ['Procedures'], responses: { 200: { description: 'Procedures' } } }, post: { summary: 'Create procedure', tags: ['Procedures'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/procedures/{id}'] = { get: { summary: 'Get procedure', tags: ['Procedures'], responses: { 200: { description: 'Procedure' } } }, put: { summary: 'Update procedure', tags: ['Procedures'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete procedure', tags: ['Procedures'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };
spec.paths['/api/procedures/{id}/product'] = { put: { summary: 'Link/unlink product', tags: ['Procedures'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Linked' } } } };

// ── Procedure Imports ─────────────────────────────────────────────────
spec.paths['/api/procedure-imports/analyze'] = { post: { summary: 'Analyze document into procedure proposal', tags: ['Procedure Imports'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Proposal created' } } } };
spec.paths['/api/procedure-imports/{id}/approve'] = { post: { summary: 'Approve proposal (creates materials/recipe/product/procedure)', tags: ['Procedure Imports'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Approved' } } } };
spec.paths['/api/procedure-imports/{id}/reject'] = { post: { summary: 'Reject proposal', tags: ['Procedure Imports'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Rejected' } } } };

// ── Documents ─────────────────────────────────────────────────────────
spec.paths['/api/documents'] = { get: { summary: 'List documents', tags: ['Documents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Documents' } } }, post: { summary: 'Upload document', tags: ['Documents'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Uploaded' } } } };
spec.paths['/api/documents/{id}/file'] = { get: { summary: 'Download document', tags: ['Documents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'File bytes' } } } };
spec.paths['/api/documents/{id}/ocr'] = { post: { summary: 'OCR a document', tags: ['Documents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'OCR result' } } } };
spec.paths['/api/documents/assemble'] = { post: { summary: 'Assemble scanned pages into PDF', tags: ['Documents'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Assembled PDF' } } } };

// ── Raw Materials ─────────────────────────────────────────────────────
spec.paths['/api/bom/materials'] = { get: { summary: 'List raw materials', tags: ['Raw Materials'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Materials' } } }, post: { summary: 'Create material', tags: ['Raw Materials'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/bom/materials/{id}'] = { patch: { summary: 'Update material', tags: ['Raw Materials'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } } };
spec.paths['/api/bom/materials/{id}/adjust'] = { post: { summary: 'Adjust stock', tags: ['Raw Materials'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Adjusted' } } } };

// ── Suppliers ─────────────────────────────────────────────────────────
spec.paths['/api/suppliers'] = { get: { summary: 'List suppliers', tags: ['Suppliers'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Suppliers' } } }, post: { summary: 'Create supplier', tags: ['Suppliers'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/suppliers/{id}'] = { get: { summary: 'Get supplier', tags: ['Suppliers'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Supplier' } } }, patch: { summary: 'Update supplier', tags: ['Suppliers'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete supplier', tags: ['Suppliers'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };

// ── Purchase Orders ───────────────────────────────────────────────────
spec.paths['/api/purchase-orders'] = { get: { summary: 'List POs', tags: ['Purchase Orders'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'POs' } } }, post: { summary: 'Create PO', tags: ['Purchase Orders'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };

// ── Inventory ─────────────────────────────────────────────────────────
spec.paths['/api/inventory/levels'] = { get: { summary: 'Inventory levels', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Levels' } } } };
spec.paths['/api/inventory/low-stock'] = { get: { summary: 'Low stock items', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Low stock' } } } };
spec.paths['/api/inventory/rebalance'] = { get: { summary: 'Transfer suggestions', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Suggestions' } } } };

// ── Procurement ───────────────────────────────────────────────────────
spec.paths['/api/procurement/drafts'] = { get: { summary: 'List draft materials', tags: ['Procurement'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Drafts' } } } };
spec.paths['/api/procurement/{id}/approve'] = { post: { summary: 'Approve draft material', tags: ['Procurement'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Approved' } } } };
spec.paths['/api/procurement/{id}/reject'] = { post: { summary: 'Reject draft material', tags: ['Procurement'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Rejected' } } } };
spec.paths['/api/procurement/replenish'] = { post: { summary: 'Trigger replenishment', tags: ['Procurement'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Result' } } } };
spec.paths['/api/procurement/auto'] = { post: { summary: 'Auto procurement workflow', tags: ['Procurement'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Result' } } } };

// ── Production Runs ───────────────────────────────────────────────────
spec.paths['/api/production-runs'] = { get: { summary: 'List production runs', tags: ['Production'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Runs' } } }, post: { summary: 'Create production run', tags: ['Production'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/production-runs/{id}'] = { patch: { summary: 'Update run status', tags: ['Production'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } } };

// ── Admin ─────────────────────────────────────────────────────────────
spec.paths['/api/admin/kpis'] = { get: { summary: 'Dashboard KPIs', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'KPIs' } } } };
spec.paths['/api/admin/failed-ops'] = { get: { summary: 'List failed side effects', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Failed ops' } } } };
spec.paths['/api/admin/failed-ops/{id}/retry'] = { post: { summary: 'Retry failed side effect', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Retried' } } } };
spec.paths['/api/admin/failed-ops/retryable'] = { get: { summary: 'List retryable operations', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Operation names' } } } };
spec.paths['/api/admin/archive'] = { post: { summary: 'Archive old records', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Archived' } } } };
spec.paths['/api/admin/archive/stats'] = { get: { summary: 'Archive stats', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Stats' } } } };
spec.paths['/api/studio-health'] = { get: { summary: 'Studio health dashboard', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Health data' } } } };
spec.paths['/api/metrics'] = { get: { summary: 'Request metrics', tags: ['Admin'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Metrics' } } } };

// ── Agents ────────────────────────────────────────────────────────────
spec.paths['/api/agents'] = { get: { summary: 'List agents', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Agents' } } } };
spec.paths['/api/v2/agents'] = { get: { summary: 'List in-app agents', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Agents' } } }, post: { summary: 'Create agent', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/v2/agents/{id}'] = { get: { summary: 'Get agent', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Agent' } } }, patch: { summary: 'Update agent', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete agent', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };
spec.paths['/api/v2/agents/{id}/run'] = { post: { summary: 'Run agent', tags: ['Agents'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Run result' } } } };

// ── Skills ────────────────────────────────────────────────────────────
spec.paths['/api/skills'] = { get: { summary: 'List skills', tags: ['Skills'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Skills' } } }, post: { summary: 'Create skill', tags: ['Skills'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/skills/{id}'] = { get: { summary: 'Get skill', tags: ['Skills'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Skill' } } }, patch: { summary: 'Update skill', tags: ['Skills'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete skill', tags: ['Skills'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };

// ── Workflows ─────────────────────────────────────────────────────────
spec.paths['/api/workflows'] = { get: { summary: 'List workflows', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Workflows' } } }, post: { summary: 'Create workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/workflows/{id}'] = { get: { summary: 'Get workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Workflow' } } }, patch: { summary: 'Update workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };
spec.paths['/api/workflows/{id}/run'] = { post: { summary: 'Run workflow', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Run result' } } } };
spec.paths['/api/workflows/{id}/runs'] = { get: { summary: 'Workflow run history', tags: ['Workflows'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Runs' } } } };

// ── Automations ───────────────────────────────────────────────────────
spec.paths['/api/automations'] = { get: { summary: 'List automations', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Automations' } } }, post: { summary: 'Create automation', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } };
spec.paths['/api/automations/{id}'] = { get: { summary: 'Get automation', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Automation' } } }, patch: { summary: 'Update automation', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Updated' } } }, delete: { summary: 'Delete automation', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Deleted' } } } };
spec.paths['/api/automations/{id}/trigger'] = { post: { summary: 'Trigger automation', tags: ['Automations'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Triggered' } } } };

// ── Export ─────────────────────────────────────────────────────────────
spec.paths['/api/export/inventory'] = { get: { summary: 'Export inventory CSV', tags: ['Export'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'CSV' } } } };
spec.paths['/api/export/materials'] = { get: { summary: 'Export raw materials CSV', tags: ['Export'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'CSV' } } } };
spec.paths['/api/export/orders'] = { get: { summary: 'Export orders CSV', tags: ['Export'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'CSV' } } } };
spec.paths['/api/export/suppliers'] = { get: { summary: 'Export suppliers CSV', tags: ['Export'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'CSV' } } } };

// ── 3D Models ─────────────────────────────────────────────────────────
spec.paths['/api/models-3d'] = { get: { summary: 'List 3D models', tags: ['3D Models'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Models' } } }, post: { summary: 'Upload GLB', tags: ['3D Models'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Uploaded' } } } };
spec.paths['/api/models-3d/{templateId}/file'] = { get: { summary: 'Stream GLB file', tags: ['3D Models'], responses: { 200: { description: 'GLB binary' } } } };

// ── Health ────────────────────────────────────────────────────────────
spec.paths['/api/health'] = { get: { summary: 'Health check', tags: ['System'], responses: { 200: { description: 'OK' } } } };

export default spec;
