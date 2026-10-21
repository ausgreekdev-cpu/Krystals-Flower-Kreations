// Shared LLM transport (JSON-in / JSON-out).
//
// One place for provider plumbing so the procedure analyser and the document
// enricher share the same behaviour, cost and failure handling.
//
// - LLM_PROVIDER: anthropic (default) | openai | opencode-go
// - LLM_API_KEY:  provider key (required for any LLM call)
// - LLM_MODEL:    optional override
// - LLM_BASE_URL: optional base override (OpenAI-compatible gateways)
//
// `__setLlmCall(fn)` stubs the transport in tests (fn receives the raw prompt
// and returns a JSON string or object) — no network in the suite.
let callImpl = null;
export function __setLlmCall(fn) { callImpl = fn; }

export function llmAvailable() {
  return Boolean(callImpl) || Boolean(process.env.LLM_API_KEY);
}

function parseJsonReply(raw) {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in LLM reply');
  return JSON.parse(s.slice(start, end + 1));
}

function defaultModel(provider) {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'opencode-go') return 'mimo-v2.6-flash';
  return 'claude-3-5-haiku-latest';
}

/**
 * Call the LLM and return parsed JSON.
 * @param {object} opts
 * @param {string} opts.system  system prompt (the output contract)
 * @param {string} opts.user    user content (document text etc.)
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.session] stable id for gateway routing/cache
 * @param {string} [opts.userAgent]
 * @returns {Promise<object>}
 */
export async function llmJson({ system, user, maxTokens = 2000, session, userAgent = 'krystal-llm/1.0' }) {
  if (callImpl) return parseJsonReply(await callImpl(user, { system, maxTokens }));

  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  const key = process.env.LLM_API_KEY || '';
  const model = defaultModel(provider);
  let reply;

  if (provider === 'opencode-go') {
    // OpenCode Go: OpenAI-compatible chat completions. Contract (docs/go):
    // custom user-agent identifying this client + a stable x-opencode-session
    // per conversation for routing/prompt-cache; JSON enforced by prompt only
    // (response_format isn't universally supported on the gateway).
    const base = (process.env.LLM_BASE_URL || 'https://opencode.ai/inference/go/openai/v1').replace(/\/+$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'user-agent': userAgent,
        'x-opencode-session': session || `krystal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    reply = (await res.json())?.choices?.[0]?.message?.content;
  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    reply = (await res.json())?.choices?.[0]?.message?.content;
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    reply = (await res.json())?.content?.[0]?.text;
  }
  return parseJsonReply(reply);
}
