import { runSkill } from '../../agents/skills/index.js';

export async function run() {
  const r = await runSkill('suggest_reorder', { input: {} });
  return { ok: true, ...r };
}
