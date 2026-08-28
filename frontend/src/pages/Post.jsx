import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
export default function Post(){
  const {slug}=useParams(); const [p,setP]=useState(null);
  useEffect(()=>{ fetch(`/api/posts/${slug}`).then(r=>r.json()).then(setP).catch(()=>{}); }, [slug]);
  if(!p) return <div className="p-8 text-center">Loading...</div>;
  return <div className="max-w-3xl mx-auto px-4 py-8"><h1 className="text-3xl font-black text-bloom-700">{p.title}</h1><p className="text-gray-500 mt-2">{p.excerpt}</p><div className="prose mt-6 whitespace-pre-wrap">{p.content}</div></div>;
}
