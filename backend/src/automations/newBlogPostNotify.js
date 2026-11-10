const a = { name:'new-blog-post-notify', description:'Notify subscribers on new post (stub).', trigger:'event:post.published', async run(ctx){ return { ok: true, ctx }; } };
export default a;
