import prisma from '../lib/prisma.js';
const agent = { name:'returns-analyst', description:'Summarize recent low-rated reviews.', tools:['summarize_reviews'], systemPrompt:'Returns analyst.', async run(){ return runSkill('summarize_reviews', { input: {} }); } };
export default agent;
