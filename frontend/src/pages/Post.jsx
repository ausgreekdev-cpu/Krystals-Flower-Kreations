import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Breadcrumbs from '../components/layout/Breadcrumbs';

const ORG = "Krystal's Flower Kreations";

export default function Post(){
  const {slug}=useParams(); const [p,setP]=useState(null); const [err,setErr]=useState('');
  useEffect(()=>{
    setErr('');
    fetch(`/api/posts/${slug}`).then(r=>{ if(!r.ok) throw new Error(r.status===404?'Post not found':'Failed to load post'); return r.json(); }).then(setP).catch(e=>setErr(e.message||'Failed to load post'));
  }, [slug]);
  if(err) return <div className="max-w-3xl mx-auto px-4 py-8 text-center text-red-600">{err} — <Link to="/blog" className="underline font-bold">Back to Journal</Link></div>;
  if(!p) return <div className="max-w-3xl mx-auto px-4 py-8 text-center">Loading...</div>;
  const origin = window.location.origin;
  const postLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.excerpt || undefined,
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
      <div className="prose mt-6 whitespace-pre-wrap">{p.content}</div>
    </div>
  );
}
