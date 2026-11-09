import analyzeProcedure from './analyzeProcedure.js';
import { registerSkill } from './registry.js';
import generateSeoCopy from './generateSeoCopy.js';
import matchMaterials from './matchMaterials.js';
import priceProposal from './priceProposal.js';
import classifyDocument from './classifyDocument.js';
import suggestReorder from './suggestReorder.js';
import draftEmail from './draftEmail.js';
import scanInventoryAnomalies from './scanInventoryAnomalies.js';
import summarizeReviews from './summarizeReviews.js';
import draftSocialPost from './draftSocialPost.js';

for (const s of [generateSeoCopy, matchMaterials, priceProposal, classifyDocument, suggestReorder, draftEmail, scanInventoryAnomalies, summarizeReviews, draftSocialPost, analyzeProcedure]) {
  registerSkill(s);
}

export { registerSkill, getSkill, listSkills, runSkill } from './registry.js';
