import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import { renderMarkdown } from '../lib/markdown';
import { usePublicSettings } from '../lib/publicSettings';

const ORG = "Krystals Flower Creations";
const DEFAULT_TITLE = "Krystals Flower Creations — Paper Florist Perth WA";

export default function Post(){
  const {slug}=useParams(); const [p,setP]=useState(null); const [err,setErr]=useState('');
  const s = usePublicSettings();
  useEffect(()=>{
    setErr('');
    fetch(`/api/posts/${slug}`).then(r=>{ if(!r.ok) throw new Error(r.status===404?'Post not found':'Failed to load post'); return r.json(); }).then(setP).catch(e=>setErr(e.message||'Failed to load post'));
  }, [slug]);
  // Per-post SEO head (Googlebot renders JS; SPA can't emit crawler-visible og:image)
  useEffect(()=>{
    if(!p || !p.title) return;
    document.title = (p.metaTitle || `${p.title} | ${ORG}`).slice(0, 70);
    const desc = (p.metaDescription || p.excerpt || '').slice(0, 170);
    const meta = document.querySelector('meta[name="description"]');
    if (meta && desc) meta.setAttribute('content', desc);
    return () => { document.title = DEFAULT_TITLE; };
  }, [p]);
  if(err) return <div className="max-w-3xl mx-auto px-4 py-8 text-center text-red-600">{err} — <Link to="/blog" className="underline font-bold">Back to Journal</Link></div>;
  if(!p) return <div className="max-w-3xl mx-auto px-4 py-8 text-center">Loading...</div>;
  const origin = window.location.origin;
  const postLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.metaDescription || p.excerpt || undefined,
    image: p.coverImageUrl ? (p.coverImageUrl.startsWith('http') ? p.coverImageUrl : `${origin}${p.coverImageUrl}`) : undefined,
    datePublished: p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0,10) : undefined,
    dateModified: p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0,10) : undefined,
    mainEntityOfPage: `${origin}/blog/${slug}`,
    keywords: p.tags || undefined,
    publisher: { '@type': 'Organization', name: ORG },
  };
  const shareUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(p.title);
  const shareCls = "border rounded-full px-3 py-1.5 hover:bg-surface3";
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(postLd)}} />
      <Breadcrumbs items={[{label:'Journal', to:'/blog'}, {label:p.title}]} />
      <h1 className="text-3xl font-black text-ink">{p.title}</h1>
      <p className="text-muted mt-2">{p.excerpt}</p>
      <div className="flex flex-wrap gap-2 text-xs mt-3">
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer" className={shareCls}>Share FB</a>
        <a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" className={shareCls}>Share X</a>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${p.title} ${window.location.href}`)}`} target="_blank" rel="noreferrer" className={shareCls}>WhatsApp</a>
        <a href={`mailto:?subject=${shareText}&body=${shareUrl}`} className={shareCls}>Email</a>
        <button onClick={()=>navigator.clipboard.writeText(window.location.href)} className={shareCls}>Copy link</button>
      </div>
      <div className="prose markdown-body mt-6" dangerouslySetInnerHTML={{__html: renderMarkdown(p.content || '')}} />
      <section className="mt-8 border-t pt-6" aria-label="Related products">
        <h2 className="font-black text-ink text-lg">Related products</h2>
        {Array.isArray(p.products) && p.products.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {p.products.map(rp => rp.product && (
              <Link key={rp.product.id} to={`/product/${rp.product.slug}`} className="bg-surface2 border rounded-2xl p-3 hover:shadow hover:border-bloom-100 transition">
                <img loading="lazy" src={rp.product.images?.[0]?.url || '/placeholder-bloom.jpg'} alt={rp.product.title} className="w-full h-28 object-cover rounded-xl" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} />
                <div className="font-bold text-sm text-ink mt-2 line-clamp-2">{rp.product.title}</div>
                <div className="text-highlight font-bold text-sm">${Number(rp.product.price).toFixed(2)}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted mt-2">{s.show_workshops === '1' ? 'Fresh blooms, SVG templates & workshop tickets' : 'Fresh blooms & custom commissions'} — <Link to="/shop" className="underline">browse the shop →</Link></p>
        )}
      </section>
    </div>
  );
}
