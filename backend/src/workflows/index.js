import { registerWorkflow } from './registry.js';
import WORKFLOWS from './definitions.js';
for (const w of WORKFLOWS) registerWorkflow(w);
export { registerWorkflow, getWorkflow, listWorkflows } from './registry.js';
export { WORKFLOWS } from './definitions.js';
