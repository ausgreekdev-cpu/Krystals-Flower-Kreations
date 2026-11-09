// Central registry for agent skills. Each skill module exports:
//   { name, description, inputSchema (zod), run(ctx) -> Promise<any> }
// Skills are pure functions over a context; side effects (DB writes) happen
// inside run() and must be idempotent + audit-logged.

const skills = new Map();

export function registerSkill(skill) {
  if (!skill?.name) throw new Error('skill requires a name');
  if (skills.has(skill.name)) throw new Error(`skill already registered: ${skill.name}`);
  skills.set(skill.name, skill);
  return skill;
}

export function getSkill(name) {
  return skills.get(name) || null;
}

export function listSkills() {
  return [...skills.values()].map((s) => ({ name: s.name, description: s.description }));
}

export async function runSkill(name, ctx) {
  const skill = getSkill(name);
  if (!skill) throw new Error(`unknown skill: ${name}`);
  if (skill.inputSchema) {
    const parsed = skill.inputSchema.safeParse(ctx?.input ?? {});
    if (!parsed.success) throw new Error(`invalid input for ${name}: ${parsed.error.message}`);
    ctx = { ...ctx, input: parsed.data };
  }
  return skill.run(ctx);
}
