export default function Admin(){
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Admin — Studio Manager</h1>
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <a href="/api/products" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">📦 Products JSON</a>
        <a href="/api/orders" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">🧾 Orders (auth)</a>
        <a href="/api/posts" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">📝 Posts</a>
        <a href="/api/workshops" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">🎨 Workshops</a>
        <a href="/api/inventory/levels" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">📊 Inventory</a>
        <a href="/api/meta/status" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">🔗 Meta Sync</a>
        <a href="/api/health" target="_blank" className="bg-white p-4 rounded-2xl border hover:shadow">💚 Health</a>
      </div>
      <div className="mt-8 bg-white p-6 rounded-2xl border">
        <h3 className="font-bold">Quick Start</h3>
        <pre className="mt-3 bg-gray-900 text-green-300 p-4 rounded-xl text-xs overflow-auto">{`docker compose up -d db
cd backend && cp .env.example .env && npm install && npx prisma migrate dev --name init && npx prisma db seed && npm run dev
# frontend
cd ../frontend && npm install && npm run dev
# mobile
cd ../mobile && npm install && npx expo start`}</pre>
        <p className="text-sm text-gray-600 mt-3">Meta sync: set META_CATALOG_ID + META_ACCESS_TOKEN in backend/.env then POST /api/meta/sync-all</p>
      </div>
    </div>
  );
}
