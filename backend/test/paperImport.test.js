import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

// CSV import of the studio intake template ("Colour Name,Image,colourHex,Type,
// Brand,Pack Name,Texture,GSM,Weight LB,SKU,onHand,lowThreshold,sortOrder,
// isActive,To Sell") — parses quoted fields, skips the option-list rows,
// upserts by SKU on re-import.

let srv;
let adminToken;
const RUN = Date.now().toString(36);
const SKU = `CS-PL-WIN-BLUSH-${RUN}`;

const TEMPLATE = [
  '"Colour Name","Image","colourHex","Type","Brand","Pack Name","Texture","GSM","Weight LB","SKU","onHand","lowThreshold","sortOrder","isActive","To Sell",',
  `"Blush ${RUN}",,"#F8C4B4","Cardstock","Park Lane","Winter","Smooth",80,80,"${SKU}",30,5,1,TRUE,TRUE,`,
  ',,,"Paper","Quill","","Textured",125,,,,,,,FALSE,"(stock only etc..)"',
  ',,,"Foil","Anko","","Glitter",176,,,,,,,',
  ',,,,"Francheville","","Metallic",210,,,,,,,',
  ',,,,"Crafters Choice",,,300,,,,,,,',
].join('\n');

const LEGACY = 'Glitter Test ' + RUN + ',Gold,#FFD700,Pearl,glitter,125gsm,2,12,3,2,true\n';

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  adminToken = login.body.token;
});

after(async () => {
  await srv.close();
  await prisma.paperStock.deleteMany({ where: { sku: { in: [SKU] } } }).catch(() => {});
  await prisma.paperStock.deleteMany({ where: { name: { contains: RUN } } }).catch(() => {});
});

test('imports the intake template: example row mapped, option rows skipped', async () => {
  const res = await api(srv.base, '/api/paper-stocks/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ csv: TEMPLATE }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.created, 1);
  assert.equal(res.body.updated, 0);
  assert.equal(res.body.skipped, 4, 'the four option-list rows are skipped');
  assert.equal(res.body.errors.length, 0);

  const p = res.body.papers[0];
  assert.equal(p.sku, SKU);
  assert.equal(p.colour, `Blush ${RUN}`);
  assert.equal(p.colourHex, '#F8C4B4');
  assert.equal(p.stockType, 'Cardstock');
  assert.equal(p.paperType, 'Park Lane');
  assert.equal(p.packName, 'Winter');
  assert.equal(p.texture, 'smooth');
  assert.equal(p.weight, '80lb');
  assert.equal(p.name, `Blush ${RUN} 80 Park Lane Winter`, 'name follows the studio convention (colour gsm brand pack)');
  assert.equal(p.onHand, 30);
  assert.equal(p.lowThreshold, 5);
  assert.equal(p.sortOrder, 1);
  assert.equal(p.isActive, true);
  assert.equal(p.sellable, true);
});

test('re-import updates the same SKU instead of duplicating', async () => {
  const csv = TEMPLATE.replace(',30,5,1,TRUE,TRUE,', ',12,5,1,TRUE,FALSE,');
  const res = await api(srv.base, '/api/paper-stocks/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ csv }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.created, 0);
  assert.equal(res.body.updated, 1);
  const p = res.body.papers[0];
  assert.equal(p.onHand, 12, 'stock updated in place');
  assert.equal(p.sellable, false, 'To Sell FALSE -> sellable false (stock only)');
  const count = await prisma.paperStock.count({ where: { sku: SKU } });
  assert.equal(count, 1, 'no duplicate row');
});

test('legacy app export format still imports (glitter/metallic textures valid)', async () => {
  const res = await api(srv.base, '/api/paper-stocks/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ csv: 'name,colour,colourHex,paperType,texture,weight,pricePremiumPerStem,onHand,lowThreshold,sortOrder,isActive\n' + LEGACY }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.created, 1);
  const p = res.body.papers[0];
  assert.equal(p.name, `Glitter Test ${RUN}`);
  assert.equal(p.texture, 'glitter');
  assert.equal(Number(p.pricePremiumPerStem), 2, 'Decimal serializes as string in JSON');
});

test('import RBAC + validation', async () => {
  const anon = await api(srv.base, '/api/paper-stocks/import', { method: 'POST', body: JSON.stringify({ csv: TEMPLATE }) });
  assert.equal(anon.status, 401);
  const badHeader = await api(srv.base, '/api/paper-stocks/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ csv: 'foo,bar\n1,2' }),
  });
  assert.equal(badHeader.status, 400);
  const tooShort = await api(srv.base, '/api/paper-stocks/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ csv: 'x' }),
  });
  assert.equal(tooShort.status, 400);
});
