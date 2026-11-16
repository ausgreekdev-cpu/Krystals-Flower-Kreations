import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'new-blog-post-notify',
  description: 'Notify subscribers on new post.',
  trigger: 'event:post.published',
  async run(ctx) {
    const { post, subscribers } = ctx || {};
    if (!subscribers?.length) return { ok: true, skipped: true };
    for (const s of subscribers) {
      if (s.email) await enqueueEmail({ to: s.email, subject: `New post: ${post?.title || ''}`, text: post?.excerpt || '' });
    }
    return { ok: true, notified: subscribers.length };
  },
};
export default a;
