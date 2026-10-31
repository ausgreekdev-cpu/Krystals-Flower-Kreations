// OpenAPI spec serving route.
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import spec from '../lib/openapiSpec.js';

const router = Router();

router.get('/openapi.json', asyncHandler(async (req, res) => {
  res.json(spec);
}));

router.get('/docs', asyncHandler(async (req, res) => {
  // Simple Swagger UI via CDN
  res.type('html').send(`<!DOCTYPE html>
<html><head><title>Krystal's Flower Kreations API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui' });</script>
</body></html>`);
}));

export default router;
