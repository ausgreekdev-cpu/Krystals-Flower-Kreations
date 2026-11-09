const agent = { name:'customer-care', description:'Answer customer questions (stub).', tools:[], systemPrompt:'Friendly customer service.', async run(ctx){ return { reply: 'Thanks for reaching out — the studio will get back to you shortly.' }; } };
export default agent;
