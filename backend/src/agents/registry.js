const agents = new Map();
export function registerAgent(a) { if (!a?.name) throw new Error('agent requires name'); if (agents.has(a.name)) throw new Error('duplicate agent: '+a.name); agents.set(a.name, a); return a; }
export function getAgent(n){return agents.get(n)||null;}
export function listAgents(){return [...agents.values()].map(a=>({name:a.name,description:a.description,tools:a.tools||[]}));}
export async function runAgent(name, ctx){const a=getAgent(name); if(!a) throw new Error('unknown agent: '+name); return a.run(ctx);}
