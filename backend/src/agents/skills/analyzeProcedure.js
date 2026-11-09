import { z } from 'zod';
import { analyzeProcedure } from '../../services/procedureAnalyzer.js';

const inputSchema = z.object({ text: z.string().min(1) }).strict();

async function run(ctx) {
  return analyzeProcedure(ctx.input.text);
}

export default { name: 'analyze_procedure', description: 'Extract materials/labour/BOM from procedure text.', inputSchema, run };
