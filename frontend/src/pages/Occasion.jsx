import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePublicSettings } from '../lib/publicSettings';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import Btn from '../components/ui/Btn';
import ProductCard from '../components/ProductCard';

const KNOWN = {
  wedding: { title: 'Wedding Flowers', blurb: 'Everlasting paper blooms for bouquets, buttonholes and table centres — Perth-made, no wilting, no water. Plan months ahead: paper flowers hold their shape from first look to last dance.' },
  birthday: { title: 'Birthday Flowers', blurb: 'A birthday bouquet that outlasts the cake. Made-to-order paper blooms in the birthday colours they actually love — with same-week Perth turnaround.' },
  'mothers-day': { title: "Mother's Day Flowers", blurb: 'Give Mum flowers that never wilt. Our paper bouquets are handmade in Perth and keep glowing on the shelf long after Sunday.' },
  anniversary: { title: 'Anniversary Flowers', blurb: 'Mark the years with blooms that last — paper roses and natives you can keep together for every anniversary after this one.' },
  sympathy: { title: 'Sympathy Flowers', blurb: 'Gentle, lasting tributes for farewells and remembrance. Calm native tones, handmade with care in our Perth studio.' },
  graduation: { title: 'Graduation Flowers', blurb: 'Celebrate the milestone with a bouquet that lasts past the photos — perfect keepsakes for Perth grads.' },
  housewarming: { title: 'Housewarming Flowers', blurb: 'A housewarming bloom with no water needed — set it up on day one and it stays fresh for years.' },
};

const slugifyLabel = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Occasion(){
  const { slug } = useParams();
  const s = usePublicSettings();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const known = KNOWN[slug];
  const title = known?.title || `${slugifyLabel(slug || '')} Flowers`;

  useEffect(() => {
    document.title = `${title} Perth WA — Krystals Flower Creations`;
    let meta = document.querySelector('meta[name="description"]');
    if(!meta){ meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = `${title} in Perth — handmade everlasting paper flowers from Krystals Flower Creations. Made to order, GST inclusive, free Perth delivery over $${Number(s.shipping_free_over) || 150}.`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if(!canonical){ canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${window.location.origin}/occasions/${slug}`;
  }, [slug, title, s.shipping_free_over]);

  useEffect(() => {
    setProducts(null); setError('');
    fetch(`/api/products?occasion=${encodeURIComponent(slug)}&limit=60`)
      .then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setProducts(Array.isArray(d) ? d : (Array.isArray(d.products) ? d.products : [])))
      .catch(e => { setError(e.message); setProducts([]); });
  }, [slug]);

  const arr = products || [];
  const itemListLd = arr.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: arr.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      name: p.title, url: `${window.location.origin}/product/${p.slug}`,
    })),
  } : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(itemListLd)}} />}
      <Breadcrumbs items={[{label:'Shop', to:'/shop'}, {label:title}]} />
      <div className="max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-black text-ink">{title} — handmade paper flowers</h1>
        <p className="text-sm text-muted mt-2">{known?.blurb || 'Handmade everlasting paper blooms from our Perth studio — made to order, GST inclusive, free Perth delivery over $150.'}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(KNOWN).map(([k, v]) => (
          <Link key={k} to={`/occasions/${k}`} className={`px-3 py-1.5 rounded-full text-xs border ${k===slug?'bg-bloom-500 text-white border-bloom-500':'bg-surface2 hover:bg-surface3'}`}>{v.title}</Link>
        ))}
      </div>
      {products === null ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({length:8}).map((_,i)=><div key={i} className="bg-surface2 rounded-2xl overflow-hidden border animate-pulse"><div className="h-44 md:h-52 bg-surface"/><div className="p-3 space-y-2"><div className="h-4 bg-surface rounded"/><div className="h-3 bg-surface rounded w-2/3"/></div></div>)}
        </div>
      ) : error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">Failed to load blooms: {error}</div>
      ) : arr.length ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {arr.map(p => <ProductCard key={p.id} p={p} showCricut={s.show_cricut === '1'} />)}
        </div>
      ) : (
        <div className="mt-6 bg-surface2 border rounded-2xl p-8 text-center">
          <p className="text-muted">Nothing listed for this occasion right now — but almost any bloom can be made for it.</p>
          <div className="mt-4 flex gap-3 justify-center">
            <Btn to="/shop" variant="primary" size="md">Browse all blooms</Btn>
            <Btn to="/configurator" variant="outline" size="md">Build a custom bouquet</Btn>
          </div>
        </div>
      )}
      {arr.length > 0 && (
        <div className="mt-8 bg-surface border border-bloom-100 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="font-bold text-ink">Want something one-of-a-kind?</div>
            <div className="text-sm text-muted">The configurator lets you pick stems, palette, vase and more — made to order for your {title.replace(' Flowers','').toLowerCase()}.</div>
          </div>
          <Btn to="/configurator" variant="primary" size="md" className="shrink-0">Open configurator</Btn>
        </div>
      )}
    </div>
  );
}
