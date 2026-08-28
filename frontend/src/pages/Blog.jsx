import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
export default function Blog(){
  const [posts,setPosts]=useState([]);
  useEffect(()=>{ fetch('/api/posts').then(r=>r.json()).then(setPosts).catch(()=>{}); }, []);
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Journal</h1>
      <p className="text-gray-600">Tutorials, Cricut tips, origami folds & studio behind-the-scenes.</p>
      <div className="mt-6 grid gap-4">
        {posts.map(p=> <Link key={p.id} to={`/blog/${p.slug}`} className="bg-white p-6 rounded-2xl border hover:shadow"><h3 className="font-bold text-bloom-700">{p.title}</h3><p className="text-sm text-gray-600 mt-2">{p.excerpt}</p><div className="text-xs text-bloom-500 mt-2">{p.tags}</div></Link>)}
      </div>
    </div>
  );
}
