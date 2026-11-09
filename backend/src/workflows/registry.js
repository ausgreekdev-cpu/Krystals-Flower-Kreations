import { compile } from '../agents/core/dag-compiler.js';
const workflows = new Map();
export function registerWorkflow(w){ if(!w?.name) throw new Error('workflow requires name'); const c = compile(w.definition); if(!c.ok) throw new Error('invalid workflow: '+c.errors.join('; ')); workflows.set(w.name, {...w, compiled: c}); return w; }
export function getWorkflow(n){return workflows.get(n)||null;}
export function listWorkflows(){return [...workflows.values()].map(w=>({name:w.name,description:w.description}));}
