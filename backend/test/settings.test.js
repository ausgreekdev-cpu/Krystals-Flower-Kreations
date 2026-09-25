import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import { normalizeSetting, validateSettingsBody, paymentInstructionsFor, SETTINGS_BY_KEY } from '../src/lib/settingsSchema.js';

let srv;
let adminToken;

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = admin.body.token;
});
after(async () => {
  // Return the shared DB to schema defaults so leftover test values can't
  // leak into other suites or the dev storefront.
  await api(srv.base, '/api/settings/reset', {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ keys: ['theme_primary', 'announcement_text', 'email_from_name', 'checkout_payment_methods'] }),
  }).catch(() => {});
  await srv.close();
});

test('unit: normalizeSetting validates types and bounds', () => {
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.tax_gst_rate, 0.25).value, '0.25');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.tax_gst_rate, 'abc').ok, false);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.tax_gst_rate, 5).ok, false, 'above max');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.theme_primary, '#a1b2c3').value, '#a1b2c3');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.theme_primary, 'red').ok, false);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.theme_primary, '').value, '', 'empty colour = default');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.instagram_url, 'https://instagram.com/x').ok, true);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.instagram_url, 'not a url').ok, false);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.contact_email, 'a@b.co').ok, true);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.contact_email, 'nope').ok, false);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.loyalty_enabled, true).value, '1');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.loyalty_enabled, '0').value, '0');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.loyalty_enabled, 'maybe').ok, false);
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.checkout_payment_methods, 'bank_transfer, pickup').value, 'bank_transfer,pickup');
  assert.equal(normalizeSetting(SETTINGS_BY_KEY.checkout_payment_methods, 'bitcoin').ok, false);
});

test('unit: validateSettingsBody rejects unknown keys with messages', () => {
  const r = validateSettingsBody({ no_such_setting: 'x', theme_primary: '#112233', bogus: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.errors.no_such_setting, 'unknown setting');
  assert.equal(r.errors.bogus, 'unknown setting');
  assert.equal(r.values.theme_primary, '#112233', 'valid keys still validated');
});

test('unit: paymentInstructionsFor builds bank/pickup copy, legacy fallback', () => {
  const bank = paymentInstructionsFor('bank_transfer', { bank_bsb: '000-000', bank_account_number: '123456', bank_account_name: 'KFK', payment_reference_hint: 'Use order #.' });
  assert.match(bank, /BSB: 000-000/);
  assert.match(bank, /123456 \(KFK\)/);
  assert.match(bank, /Use order #\./);
  const empty = paymentInstructionsFor('bank_transfer', {});
  assert.match(empty, /will be emailed/, 'falls back when settings unset');
  const pickup = paymentInstructionsFor('pickup', { pickup_address: '10 Studio St', pickup_instructions: 'Ring the bell.' });
  assert.match(pickup, /10 Studio St/);
  assert.match(pickup, /Ring the bell\./);
});

test('GET /api/settings returns defaults for public keys, never private ones', async () => {
  const pub = await api(srv.base, '/api/settings');
  assert.equal(pub.status, 200);
  assert.equal(typeof pub.body.announcement_text, 'string', 'public text key present');
  assert.equal(pub.body.bank_bsb, '', 'unset public key still present as default');
  assert.ok(!('low_stock_recipient' in pub.body), 'private keys excluded');
  assert.ok(!('email_from_name' in pub.body), 'private keys excluded');
  assert.ok(!('cart_retention_hours' in pub.body), 'private keys excluded');
});

test('GET /api/settings/schema is admin-only and well-formed', async () => {
  const anon = await api(srv.base, '/api/settings/schema');
  assert.equal(anon.status, 401);
  const res = await api(srv.base, '/api/settings/schema', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.sections) && res.body.sections.length >= 10);
  const keys = res.body.settings.map(s => s.key);
  for (const k of ['bank_bsb', 'default_color_mode', 'workshop_reminder_24h_lead', 'pos_receipt_footer', 'theme_dark_bg']) {
    assert.ok(keys.includes(k), `schema includes ${k}`);
  }
  const mode = res.body.settings.find(s => s.key === 'default_color_mode');
  assert.equal(mode.options.map(o => o.value).join(','), 'system,light,dark');
});

test('PUT settings: validates, normalises, audits; GET /all reflects values', async () => {
  const put = await api(srv.base, '/api/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ theme_primary: '#123456', announcement_text: 'Test announcement bar', email_from_name: 'KFK Test', checkout_payment_methods: 'bank_transfer,pickup,cash' }),
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.updated, 4);

  const all = await api(srv.base, '/api/settings/all', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(all.body.theme_primary, '#123456');
  assert.equal(all.body.email_from_name, 'KFK Test');
  assert.equal(all.body.checkout_payment_methods, 'bank_transfer,pickup,cash');
  assert.ok('cart_retention_hours' in all.body, 'private keys present for admin with default');

  const pub = await api(srv.base, '/api/settings');
  assert.equal(pub.body.theme_primary, '#123456', 'public read sees stored colour');
  assert.equal(pub.body.announcement_text, 'Test announcement bar');
  assert.ok(!('email_from_name' in pub.body), 'private value stays private');
});

test('PUT settings: unknown key and bad values are rejected atomically', async () => {
  const unknown = await api(srv.base, '/api/settings', {
    method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ theme_primary: '#223344', drop_database: 'yes' }),
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, 'invalid_settings');
  assert.equal(unknown.body.details.drop_database, 'unknown setting');

  const bad = await api(srv.base, '/api/settings', {
    method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ theme_primary: 'mauve', tax_gst_rate: 'lots' }),
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.details.theme_primary, /hex/);
  assert.match(bad.body.details.tax_gst_rate, /number/);

  const all = await api(srv.base, '/api/settings/all', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.notEqual(all.body.theme_primary, 'mauve', 'nothing written on invalid body');
});

test('PUT settings: non-staff is forbidden', async () => {
  const email = `settings_${Date.now()}@test.com`;
  const reg = await api(srv.base, '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Settings Tester', email, password: 'secret123' }) });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const res = await api(srv.base, '/api/settings', {
    method: 'PUT', headers: { Authorization: `Bearer ${reg.body.token}` },
    body: JSON.stringify({ announcement_text: 'nope' }),
  });
  assert.equal(res.status, 403);
});

test('POS open without openingCash applies pos_till_float_default', async () => {
  const res = await api(srv.base, '/api/pos/session/open', {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ location: 'Settings float check' }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(Number(res.body.openingCash), 50, 'schema default till float is 50');

  const explicit = await api(srv.base, '/api/pos/session/open', {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ location: 'Settings float explicit', openingCash: 25 }),
  });
  assert.equal(explicit.status, 201);
  assert.equal(Number(explicit.body.openingCash), 25, 'explicit openingCash still wins');
});
