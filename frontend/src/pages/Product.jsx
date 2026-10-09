import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { addToCart as addToCartApi } from '../lib/cartClient';
import { usePublicSettings } from '../lib/publicSettings';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import Btn from '../components/ui/Btn';
import { Input, Select, TextArea } from '../components/ui/Field';

const ORG = "Krystals Flower Creations";
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

export default function Product(){
  const s = usePublicSettings();
  const {slug}=useParams(); const nav=useNavigate(); const [p,setP]=useState(null); const [variantId,setVariantId]=useState(null); const [qty,setQty]=useState(1); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  const [reviews,setReviews]=useState([]);
  const [fieldDefs,setFieldDefs]=useState([]);
  const [rvForm,setRvForm]=useState({ name:'', rating:5, title:'', body:'', website:'' });
  const [rvSent,setRvSent]=useState(false); const [rvErr,setRvErr]=useState(''); const [rvBusy,setRvBusy]=useState(false);
  useEffect(()=>{
    fetch(`/api/products/${slug}`).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d=>{ setP(d); setReviews(Array.isArray(d.reviews)?d.reviews:[]); }).catch(e=>{ setErr(e.message); setP({ error:true }); });
  }, [slug]);
  // Field definitions drive labels/types for p.customFields — same list for every product
  useEffect(()=>{
    fetch('/api/products/fields').then(r=> r.ok? r.json(): []).then(d=> setFieldDefs(Array.isArray(d)?d:[])).catch(()=> setFieldDefs([]));
  }, []);
  async function addToCart(){
    if(!p || p.error) return;
    setErr(''); setMsg('');
    if(p.stockMode==='tracked' && stock!==999 && qty>stock){ setErr(`Only ${stock} in stock`); return; }
    try{
      const res = await addToCartApi({ productId: p.id, variantId, quantity: qty });
      setMsg(`Added ${qty} × ${p.title} to cart — ${res.cart?.items?.length||''} items`);
      setTimeout(()=> nav('/cart'), 600);
    }catch(e){ setErr(e.message || 'Failed to add'); }
  }
  async function submitReview(e){
    e.preventDefault();
    if(rvForm.website){ setRvSent(true); return; } // honeypot — silently accept
    setRvBusy(true); setRvErr('');
    try{
      const body = { productId: p.id, name: rvForm.name.trim(), rating: rvForm.rating };
      if(rvForm.title.trim()) body.title = rvForm.title.trim();
      if(rvForm.body.trim()) body.body = rvForm.body.trim();
      const res = await fetch('/api/reviews', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(!res.ok){
        const j = await res.json().catch(()=>({}));
        throw new Error(res.status===429 ? 'Too many reviews — please try again in a minute.' : (j.error || 'Could not send review'));
      }
      setRvSent(true);
    }catch(e2){ setRvErr(e2.message); }
    finally{ setRvBusy(false); }
  }
  if(!p) return <div className="p-8 text-center"><div className="animate-pulse bg-surface h-64 rounded-2xl"/><p className="mt-4 text-muted">Loading bloom…</p></div>;
  if(p.error) return <div className="p-8 text-center"><div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6">Failed to load product: {err || 'Not found'} <div className="mt-3"><Link to="/shop" className="underline font-bold">← Back to Shop</Link></div></div></div>;
  const variantsArr = Array.isArray(p.variants) ? p.variants : [];
  const imagesArr = Array.isArray(p.images) ? p.images : [];
  const activePrice = Number(variantId? variantsArr.find(v=>v.id===variantId)?.price : p.price);
  // Variantless tracked products hold stock server-side (availableQty from the
  // default InventoryLevel) — without it every tracked product showed 0 and
  // disabled Add to Cart. Untracked stays at the 999 sentinel (no limit).
  const stock = (p.stockMode==='tracked' && variantsArr.length===0 && !variantId)
    ? Number(p.availableQty ?? 0)
    : (variantsArr.find(v=>v.id===variantId)?.inventoryQuantity ?? (p.stockMode==='tracked' ? 0 : 999));
  const lowStock = p.stockMode==='tracked' && stock!==999 && stock < 5;
  // Custom fields — only show active definitions with a non-empty value (booleans are presence-only)
  const cf = (p.customFields && typeof p.customFields === 'object') ? p.customFields : {};
  const customRows = fieldDefs
    .map(d => ({ d, v: cf[d.key] }))
    .filter(({ d, v }) => d.type === 'boolean' ? v === true : (v !== undefined && v !== null && String(v).trim() !== ''));

  // Structured data — Product + Offer (+ ratings/reviews when present) and BreadcrumbList
  const origin = window.location.origin;
  const canonical = `${origin}/product/${slug}`;
  const imgAbs = imagesArr[0]?.url ? (imagesArr[0].url.startsWith('http') ? imagesArr[0].url : `${origin}${imagesArr[0].url}`) : undefined;
  const avg = reviews.length ? Math.round((reviews.reduce((a,r)=>a+Number(r.rating||0),0)/reviews.length)*10)/10 : 0;
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: p.description || undefined,
    image: imgAbs,
    sku: p.sku || undefined,
    brand: { '@type': 'Brand', name: ORG },
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'AUD',
      price: Number(p.price).toFixed(2),
      availability: p.stockMode === 'tracked' && stock === 0 ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
    aggregateRating: reviews.length ? { '@type': 'AggregateRating', ratingValue: avg, reviewCount: reviews.length, bestRating: 5, worstRating: 1 } : undefined,
    review: reviews.slice(0, 20).map(r => ({
      '@type': 'Review',
      name: r.title || undefined,
      author: { '@type': 'Person', name: r.name },
      datePublished: r.createdAt ? new Date(r.createdAt).toISOString().slice(0,10) : undefined,
      reviewBody: r.body || undefined,
      reviewRating: { '@type': 'Rating', ratingValue: Number(r.rating), bestRating: 5, worstRating: 1 },
    })),
  };
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: `${origin}/shop` },
      { '@type': 'ListItem', position: 3, name: p.title },
    ],
  };
  const shareUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(p.title);
  const shareCls = "border rounded-full px-3 py-1.5 hover:bg-surface3";
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(productLd)}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(crumbsLd)}} />
      <Breadcrumbs items={[{label:'Shop', to:'/shop'}, {label:p.title}]} />
      <div className="grid md:grid-cols-2 gap-8">
      <div className="space-y-3">
        <img loading="eager" decoding="async" src={imagesArr[0]?.url || `/placeholder-bloom.jpg`} alt={p.title} width="800" height="800" className="rounded-2xl w-full shadow-sm" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} />
        {imagesArr.length>1 && <div className="flex gap-2 overflow-auto">{imagesArr.slice(1,5).map(im=><img key={im.id} src={im.url} alt="" loading="lazy" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} className="w-20 h-20 rounded-xl object-cover border"/> )}</div>}
        <div className="flex flex-wrap gap-2 text-xs">
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer" className={shareCls}>Share FB</a>
          <a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" className={shareCls}>Share X</a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${p.title} ${window.location.href}`)}`} target="_blank" rel="noreferrer" className={shareCls}>WhatsApp</a>
          <a href={`mailto:?subject=${shareText}&body=${shareUrl}`} className={shareCls}>Email</a>
          <button onClick={()=>{navigator.clipboard.writeText(window.location.href); setMsg('Link copied');}} className={shareCls}>Copy link</button>
        </div>
        {reviews.length>0 && <div className="text-sm text-muted"><span className="text-highlight font-bold text-lg">{avg.toFixed(1)}</span> {stars(avg)} — {reviews.length} review{reviews.length>1?'s':''}</div>}
      </div>
      <div>
        <h1 className="text-3xl font-black text-ink">{p.title}</h1>
        <div className="text-2xl font-bold text-highlight mt-2">${Number(p.price).toFixed(2)} AUD</div>
        <p className="mt-4 text-ink">{p.description}</p>
        {(p.flowerType || p.colourFamily || p.stemLengthMm || (p.occasions||[]).length > 0 || p.careInstructions) && (
          <div className="mt-3 text-sm bg-surface border border-bloom-100 rounded-xl p-3 space-y-1">
            {(p.flowerType || p.colourFamily || p.stemLengthMm) && (
              <div className="flex flex-wrap gap-2">
                {p.flowerType && <span className="px-2 py-0.5 rounded-full bg-surface2 border text-xs font-semibold capitalize">{p.flowerType}</span>}
                {p.colourFamily && <span className="px-2 py-0.5 rounded-full bg-surface2 border text-xs font-semibold capitalize">{p.colourFamily.replace(/-/g,' ')}</span>}
                {p.stemLengthMm && <span className="px-2 py-0.5 rounded-full bg-surface2 border text-xs font-semibold">{p.stemLengthMm} mm stems</span>}
              </div>
            )}
            {(p.occasions||[]).length>0 && <div className="text-xs text-muted">Perfect for: {p.occasions.join(', ')}</div>}
            {p.careInstructions && <div className="text-xs text-muted">Care: {p.careInstructions}</div>}
          </div>
        )}
        {s.show_cricut === '1' && p.cricutCompatible && <div className="mt-3 text-sm bg-surface border border-bloom-100 rounded-xl p-3">✓ Cricut-compatible — {p.paperStock || 'cardstock'} • SVG available</div>}
        {p.madeToOrderDays && <div className="mt-2 text-sm text-muted">Made to order — {p.madeToOrderDays} days • Perth studio</div>}
        {customRows.length>0 && (
          <div className="mt-3 bg-surface border border-bloom-100 rounded-xl p-3 text-sm space-y-1">
            {customRows.map(({ d, v }) => (
              <div key={d.id} className="flex justify-between gap-3">
                <span className="text-muted">{d.label}</span>
                <span className="font-semibold text-ink text-right">{d.type === 'boolean' ? '✓' : d.type === 'number' ? Number(v).toLocaleString() : String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {variantsArr.length>0 && <div className="mt-4"><label className="text-sm font-bold">Variant {stock!==999 && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${lowStock?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{stock} left</span>}</label><Select value={variantId||''} onChange={e=>setVariantId(e.target.value||null)} className="mt-1 w-full"><option value="">Default — ${Number(p.price).toFixed(2)}</option>{variantsArr.map(v=> <option key={v.id} value={v.id}>{v.title} — ${Number(v.price).toFixed(2)} {v.inventoryQuantity!==undefined?`(${v.inventoryQuantity} left)`:''}</option>)}</Select></div>}
        <div className="mt-4 flex items-center gap-3"><Btn variant="soft" size="icon" onClick={()=>setQty(Math.max(1,qty-1))} aria-label="Decrease quantity">−</Btn><span className="font-bold w-8 text-center">{qty}</span><Btn size="icon" onClick={()=>setQty(Math.min(99,qty+1))} aria-label="Increase quantity">+</Btn><span className={`text-sm ${lowStock?'text-amber-600':'text-muted'}`}>{lowStock?'Low stock • Perth': stock===0?'Made to order • Perth':'in stock • Perth'} {lowStock && '— order soon'}</span></div>
        <Btn size="lg" className="mt-6 w-full transition" onClick={addToCart} disabled={p.stockMode==='tracked' && stock===0}>Add to Cart — ${ (activePrice*qty).toFixed(2)}</Btn>
        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>}
        {msg && <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{msg}</div>}
        <div className="mt-3 flex gap-2 text-xs">
          <span className="bg-surface border border-bloom-100 rounded-full px-3 py-1.5">GST inclusive</span>
          <span className="bg-surface border border-bloom-100 rounded-full px-3 py-1.5">ABN on invoice</span>
          <span className="bg-surface border border-bloom-100 rounded-full px-3 py-1.5">Click & collect 6000</span>
        </div>
        <div className="mt-4 text-xs text-muted border-t pt-3">{`Earn ${s.loyalty_earn_rate || 1} Bloom pt per $1 • Blossom at ${s.loyalty_blossom_threshold || 100} pts • Free Perth delivery over $${Number(s.shipping_free_over) || 150}`}</div>
      </div>
      </div>

      {/* Reviews — social proof (approved reviews; new ones await admin approval) */}
      <section className="mt-10 border-t pt-8" aria-label="Reviews">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-ink">Reviews {reviews.length>0 && <span className="text-base font-bold text-muted">— {avg.toFixed(1)} ★ ({reviews.length})</span>}</h2>
          {reviews.length>0 && <span className="text-2xl text-highlight" aria-hidden="true">{stars(avg)}</span>}
        </div>
        {reviews.length===0 && <p className="text-sm text-muted mt-3">No reviews yet — be the first to review this bloom.</p>}
        <div className="mt-4 grid gap-3">
          {reviews.map(r=> (
            <div key={r.id} className="bg-surface2 border rounded-2xl p-4">
              <div className="flex justify-between gap-2">
                <span className="font-bold text-sm text-ink">{r.name}</span>
                <span className="text-xs text-muted shrink-0">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-AU', { timeZone:'Australia/Perth' }) : ''}</span>
              </div>
              <div className="text-highlight text-sm" aria-label={`${r.rating} out of 5 stars`}>{stars(r.rating)}</div>
              {r.title && <div className="font-bold text-sm mt-1">{r.title}</div>}
              {r.body && <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{r.body}</p>}
            </div>
          ))}
        </div>
        <div className="mt-6 bg-surface2 border rounded-2xl p-4 max-w-2xl">
          <h3 className="font-bold text-sm text-ink">Write a review</h3>
          {rvSent ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 mt-3">Thanks! Your review is pending approval — it will appear here once the studio approves it.</p>
          ) : (
            <form onSubmit={submitReview} className="mt-3 space-y-3">
              {rvErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{rvErr}</div>}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink font-semibold">Rating</span>
                {[1,2,3,4,5].map(n=> (
                  <button type="button" key={n} onClick={()=>setRvForm(f=>({...f, rating:n}))} aria-label={`${n} star${n>1?'s':''}`}
                    className={`w-7 h-7 rounded-full border text-lg leading-none ${rvForm.rating>=n?'bg-bloom-500 text-white border-bloom-500':'bg-surface border-line text-muted hover:bg-surface3'}`}>
                    {rvForm.rating>=n?'★':'☆'}
                  </button>
                ))}
              </div>
              <Input required label="Your name" placeholder="Your name*" value={rvForm.name} onChange={e=>setRvForm(f=>({...f, name:e.target.value}))} minLength={2} maxLength={100} size="sm" className="w-full" />
              <Input label="Review title" placeholder="Title (optional)" value={rvForm.title} onChange={e=>setRvForm(f=>({...f, title:e.target.value}))} maxLength={200} size="sm" className="w-full" />
              <TextArea label="Review text" placeholder="What did you think? (optional)" value={rvForm.body} onChange={e=>setRvForm(f=>({...f, body:e.target.value}))} maxLength={2000} rows={3} size="sm" className="w-full" />
              <input type="text" value={rvForm.website} onChange={e=>setRvForm(f=>({...f, website:e.target.value}))} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              <Btn size="sm" disabled={rvBusy}>{rvBusy?'Sending…':'Submit review'}</Btn>
              <p className="text-[11px] text-muted">Reviews are checked by the studio before they appear.</p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
