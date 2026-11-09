import test from 'node:test';
import assert from 'node:assert/strict';

test('skills registry lists 10 skills', async () => {
  const m = await import('../src/agents/skills/index.js');
  const skills = m.listSkills();
  assert.equal(skills.length, 10);
  assert.ok(skills.some((s) => s.name === 'analyze_procedure'));
});
