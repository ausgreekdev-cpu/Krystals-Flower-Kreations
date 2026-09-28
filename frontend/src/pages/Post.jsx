import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Breadcrumbs from '../components/layout/Breadcrumbs';
export default function Post(){
  const {slug}=useParams(); const [p,setP]=useState(null); const [err,setErr]=useState('');
  useEffect(()=>{
    setErr('');
    fetch(`/api/posts/${slug}`).then(r=>{ if(!r.ok) throw new Error(r.status===404?'Post not found':'Failed to load post'); return r.json(); }).then(setP).catch(e=>setErr(e.message||'Failed to load post'));
  }, [slug]);
  if(err) return <div className="max-w-3xl mx-auto px-4 py-8 text-center text-red-600">{err} — <Link to="/blog" className="underline font-bold">Back to Journal</Link></div>;
  if(!p) return <div className="max-w-3xl mx-auto px-4 py-8 text-center">Loading...</div>;
  return <div className="max-w-3xl mx-auto px-4 py-8"><Breadcrumbs items={[{label:'Journal', to:'/blog'}, {label:p.title}]} /><h1 className="text-3xl font-black text-ink">{p.title}</h1><p className="text-muted mt-2">{p.excerpt}</p><div className="prose mt-6 whitespace-pre-wrap">{p.content}</div></div>;
}