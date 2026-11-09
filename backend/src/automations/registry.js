const automations = new Map();
export function registerAutomation(a){ if(!a?.name) throw new Error('automation requires name'); if(automations.has(a.name)) throw new Error('duplicate automation: '+a.name); automations.set(a.name,a); return a; }
export function getAutomation(n){return automations.get(n)||null;}
export function listAutomations(){return [...automations.values()].map(a=>({name:a.name,description:a.description,trigger:a.trigger}));}
export async function runAutomation(name, ctx){const a=getAutomation(name); if(!a) throw new Error('unknown automation: '+name); return a.run(ctx);}
