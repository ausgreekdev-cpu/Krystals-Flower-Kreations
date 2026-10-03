// Static mock quotes for GET /api/stocks — no external API, no DB table.
// Prices are fictional AUD figures for fictional ASX-style companies.
// Edit this file to change what the stock pages show.

export const STOCKS = [
  {
    ticker: 'KFK',
    company_name: "Krystal's Flower Kreations Ltd",
    current_price: 4.82,
    change: 0.14,
    change_percent: 3.0,
    currency: 'AUD',
    sector: 'Consumer Discretionary',
    description:
      'Perth-based artisan studio crafting paper flowers, native bouquets and made-to-order event arrangements. vertically integrated from design templates through to retail, workshops and market-stall direct sales.',
  },
  {
    ticker: 'FLWR',
    company_name: 'Floravale Holdings',
    current_price: 12.35,
    change: -0.27,
    change_percent: -2.1,
    currency: 'AUD',
    sector: 'Consumer Staples',
    description:
      'National wholesaler of fresh-cut flowers and foliage supplying florists, supermarkets and event hire companies across Australia.',
  },
  {
    ticker: 'BLOOM',
    company_name: 'Bloom & Stem Group',
    current_price: 7.96,
    change: 0.08,
    change_percent: 1.0,
    currency: 'AUD',
    sector: 'Industrials',
    description:
      'Operates greenhouse nurseries and hydroponic growing sites in Western Australia, supplying retail chains with potted plants and cut-flower stems.',
  },
  {
    ticker: 'PAPER',
    company_name: 'Paperform Industries',
    current_price: 2.41,
    change: 0.03,
    change_percent: 1.3,
    currency: 'AUD',
    sector: 'Materials',
    description:
      'Manufacturer of textured cardstock, craft papers and die-cut blanks for the hobby, stationery and wedding-stationery markets.',
  },
  {
    ticker: 'ROSE',
    company_name: 'Rosewood Ceramics',
    current_price: 18.7,
    change: 0.45,
    change_percent: 2.5,
    currency: 'AUD',
    sector: 'Consumer Discretionary',
    description:
      'Boutique maker of ceramic vases and vesselware sold through homeware retailers and design studios nationally.',
  },
  {
    ticker: 'STEM',
    company_name: 'Stem Logistics ASX',
    current_price: 5.14,
    change: -0.06,
    change_percent: -1.2,
    currency: 'AUD',
    sector: 'Industrials',
    description:
      'Cold-chain logistics operator moving perishable floricultural products between growers, markets and retail distribution centres.',
  },
];

export function findStock(ticker) {
  const code = String(ticker || '').toUpperCase();
  return STOCKS.find((s) => s.ticker === code) || null;
}
