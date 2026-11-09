import { z } from 'zod';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ template: z.string().min(1), vars: z.record(z.any()).optional() }).strict();

const TEMPLATES = {
  order_confirmation: (v) => `Hi ${v.name || 'there'}, thanks for your order ${v.orderNumber || ''}. We'll be in touch soon. — Krystal's Flower Kreations`,
  workshop_reminder: (v) => `Reminder: ${v.title} on ${v.date}. Bring scissors and enthusiasm!`,
};

async function run(ctx) {
  const { template, vars } = ctx.input;
  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {subject, body}.', user: JSON.stringify({ template, vars }), maxTokens: 300 });
      return { subject: out.subject || template, body: out.body || '' };
    } catch (e) {}
  }
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`unknown template: ${template}`);
  return { subject: template.replace(/_/g, ' '), body: fn(vars || {}) };
}

export default { name: 'draft_email', description: 'Draft an email from a named template.', inputSchema, run };
