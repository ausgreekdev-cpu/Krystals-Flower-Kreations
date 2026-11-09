import { registerAgent } from './registry.js';
import inventoryReplenisher from './inventoryReplenisher.js';
import orderTriage from './orderTriage.js';
import workshopOps from './workshopOps.js';
import customerCare from './customerCare.js';
import seoCopywriter from './seoCopywriter.js';
import pricingGuardian from './pricingGuardian.js';
import contentModerator from './contentModerator.js';
import supabaseHealth from './supabaseHealth.js';
import socialScheduler from './socialScheduler.js';
import returnsAnalyst from './returnsAnalyst.js';

for (const a of [inventoryReplenisher, orderTriage, workshopOps, customerCare, seoCopywriter, pricingGuardian, contentModerator, supabaseHealth, socialScheduler, returnsAnalyst]) registerAgent(a);

export { registerAgent, getAgent, listAgents, runAgent } from './registry.js';
