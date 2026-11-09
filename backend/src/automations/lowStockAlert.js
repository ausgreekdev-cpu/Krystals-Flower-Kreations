import { runSkill } from '../agents/skills/index.js';
const a = { name:'low-stock-alert', description:'Alert on low stock.', trigger:'cron:hourly', async run(){ const r = await runSkill('suggest_reorder', { input: {} }); return r; } };
export default a;
