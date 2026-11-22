const a = {
  name: 'sitemap-regenerate',
  description: 'Regenerate sitemap on content change (stub).',
  trigger: 'event:content.changed',
  async run() { return { ok: true }; },
};
export default a;
