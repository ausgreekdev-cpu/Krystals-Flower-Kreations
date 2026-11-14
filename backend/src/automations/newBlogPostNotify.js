import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'new-blog-post-notify',
  description: 'Notify subscribers on new blog post (stub list).',
  trigger: 'event:post.published',
  async run(ctx) {
    const post = ctx?.post;
    if (!post) return { ok: true, skipped: true };
    // Placeholder: real implementation would fetch subscriber list
    return { ok: true, note: 'wire to subscriber list' };
  },
};
export default a;
