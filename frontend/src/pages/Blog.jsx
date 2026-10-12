import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import Alert from '../components/ui/Alert';
import { EmptyState, Skeleton } from '../components/ui/State';

const PLACEHOLDER = '/placeholder-bloom.jpg';

export default function Blog(){
  const [posts,setPosts]=useState(null);
  const [err,setErr]=useState('');
  useEffect(()=>{ fetch('/api/posts').then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d=> setPosts(Array.isArray(d)?d: (Array.isArray(d.posts)?d.posts:[]))).catch(e=>{ setErr(e.message); setPosts([]); }); }, []);
  return (
    <Page width="default">
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Journal'}]} />} title="Journal" lede="Tutorials, Cricut tips, origami folds & studio behind-the-scenes." />
      {err && <Alert tone="danger" className="mt-4">Failed to load posts: {err}</Alert>}
      {posts === null && !err && (
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {Array.from({length:4}).map((_,i)=> <Skeleton key={i} className="h-40" />)}
        </div>
      )}
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        {(posts||[]).map(p=> (
          <Link key={p.id} to={`/blog/${p.slug}`} className="bg-surface2 rounded-2xl border overflow-hidden hover:shadow-lg hover:border-bloom-100 transition flex flex-col">
            <img loading="lazy" src={p.coverImageUrl || PLACEHOLDER} alt="" className="h-36 w-full object-cover" onError={(e)=>{ e.currentTarget.src = PLACEHOLDER; }} />
            <div className="p-4 flex-1 flex flex-col">
              <h3 className="font-bold text-base text-ink">{p.title}</h3>
              {p.publishedAt && <div className="text-xs text-muted mt-0.5">{new Date(p.publishedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
              <p className="text-sm text-muted mt-1.5 line-clamp-2">{p.excerpt}</p>
              <div className="flex flex-wrap gap-1.5 mt-auto pt-2">{(p.tags||'').split(',').map(t=>t.trim()).filter(Boolean).map(t=> <span key={t} className="text-[11px] bg-surface3 text-muted rounded-full px-2 py-0.5">{t}</span>)}</div>
            </div>
          </Link>
        ))}
      </div>
      {Array.isArray(posts) && posts.length===0 && !err && (
        <EmptyState className="mt-6" title="No posts yet" body="Studio notes and tutorials are on the way." action={<Link to="/shop" className="text-sm font-bold text-highlight underline">Browse the shop →</Link>} />
      )}
    </Page>
  );
}
