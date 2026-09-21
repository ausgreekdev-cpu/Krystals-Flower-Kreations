import app from '../src/app.js';

// Boot the Express app on an ephemeral port for integration tests.
// Requires DATABASE_URL to be set (points at the local Postgres in dev, or a
// test database in CI).
export async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export async function api(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}