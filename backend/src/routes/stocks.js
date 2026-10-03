import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { STOCKS, findStock } from '../data/stocks.js';

const router = Router();

// Public mock quotes — no auth, static data (see src/data/stocks.js)
router.get('/', asyncHandler(async (req, res) => {
  res.json(STOCKS);
}));

router.get('/:ticker', asyncHandler(async (req, res) => {
  const ticker = String(req.params.ticker || '');
  if (!/^[A-Za-z]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker', code: 'validation_failed' });
  }
  const stock = findStock(ticker);
  if (!stock) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(stock);
}));

export default router;
