import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { llmJson, llmAvailable } from '../src/services/llm.js';

// Gemini provider plumbing (Google Generative Language API). No network —
// fetch is stubbed; the key itself never appears in assertions.

const saved = {};
let savedFetch;
let calls = [];

const okReply = (text) => async (url, opts) => {
  calls.push({ url, opts });
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
};

before(() => {
  for (const k of ['LLM_PROVIDER', 'LLM_API_KEY', 'GEMINI_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL']) {
    saved[k] = process.env[k];
  }
  process.env.LLM_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  savedFetch = globalThis.fetch;
  globalThis.fetch = okReply('{"ok":true,"title":"Rose folding guide"}');
});

after(() => {
  globalThis.fetch = savedFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('gemini provider posts the documented request shape and parses the reply', async () => {
  globalThis.fetch = okReply('{"ok":true,"title":"Rose folding guide"}');
  calls = [];
  const out = await llmJson({ system: 'Return JSON only.', user: 'Analyse this procedure.' });
  assert.deepEqual(out, { ok: true, title: 'Rose folding guide' });
  assert.equal(calls.length, 1);
  const { url, opts } = calls[0];
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent$/);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['x-goog-api-key'], 'test-gemini-key');
  const body = JSON.parse(opts.body);
  assert.equal(body.systemInstruction.parts[0].text, 'Return JSON only.');
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.contents[0].parts[0].text, 'Analyse this procedure.');
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('gemini replies wrapped in code fences still parse', async () => {
  globalThis.fetch = okReply('```json\n{"steps":["fold","curl"]}\n```');
  const out = await llmJson({ system: 's', user: 'u' });
  assert.deepEqual(out, { steps: ['fold', 'curl'] });
});

test('gemini provider errors surface the upstream status', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => llmJson({ system: 's', user: 'u' }), /LLM 429/);
});

test('LLM_MODEL overrides the default gemini model', async () => {
  globalThis.fetch = okReply('{"ok":true}');
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  calls = [];
  await llmJson({ system: 's', user: 'u' });
  assert.match(calls[0].url, /models\/gemini-2\.5-flash:generateContent$/);
  delete process.env.LLM_MODEL;
});

test('llmAvailable follows the provider key', () => {
  assert.equal(llmAvailable(), true, 'gemini + GEMINI_API_KEY');
  delete process.env.GEMINI_API_KEY;
  assert.equal(llmAvailable(), false, 'gemini without a key');
  process.env.LLM_API_KEY = 'other-provider-key';
  assert.equal(llmAvailable(), true, 'LLM_API_KEY still accepted');
  delete process.env.LLM_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

test('openai provider honours LLM_BASE_URL — Gemini OpenAI-compatible surface', async () => {
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  process.env.LLM_MODEL = 'gemini-2.5-pro';
  process.env.LLM_API_KEY = 'compat-key';
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"steps":["fold","curl"]}' } }] }) };
  };
  calls = [];
  const out = await llmJson({ system: 'Return JSON only.', user: 'Analyse this procedure.' });
  assert.deepEqual(out, { steps: ['fold', 'curl'] });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer compat-key');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.model, 'gemini-2.5-pro');
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].content, 'Analyse this procedure.');
  // restore the gemini defaults for any later test
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;
  process.env.LLM_PROVIDER = 'gemini';
});
