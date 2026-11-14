const a = {
  name: 'image-variant-backfill',
  description: 'Backfill image variants (delegated to script).',
  trigger: 'manual',
  async run() {
    return { ok: true, note: 'run scripts/backfill-image-variants.mjs' };
  },
};
export default a;
