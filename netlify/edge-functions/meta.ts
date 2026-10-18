// meta — per-route OG/Twitter/meta for link-preview scrapers.
//
// Social crawlers (facebookexternalhit, Twitterbot, WhatsApp, Slack, …) do NOT
// run JS, so the SPA's client-side updateSeo() can never fix what a shared
// /product/* or /blog/* link previews as — scrapers only see index.html's
// static homepage card. This edge function rewrites <head> for known bot UAs
// with the exact title/description/image formulas the SPA already uses
// (Product.jsx, Post.jsx, Occasion.jsx, SiteLayout.jsx ROUTE_TITLES).
//
// ── Request flow ─────────────────────────────────────────────────────────
//   Accept: text/markdown → untouched (markdown.ts owns that)
//   non-bot UA            → untouched (zero cost for humans)
//   bot UA + content path → fetch origin HTML + one API call → rewrite <head>
//   anything else / error → origin HTML unchanged (same fallback as markdown.ts)
//
// ── How to test ──────────────────────────────────────────────────────────
//   curl -A facebookexternalhit/1.1 https://krystalflowercreations.netlify.app/product/<slug> | grep og:
//   curl -A Slackbot-LinkExpanding  https://krystalflowercreations.netlify.app/blog/<slug> | grep og:
//
// ── How to add or remove paths ───────────────────────────────────────────
// Paths are registered in netlify.toml under [[edge_functions]] blocks with
// function = "meta" (chained with markdown on the same paths — Netlify runs
// every matching edge function in declaration order). Add a path there, then
// handle it in buildTags() below; an unhandled path returns null and the
// origin <head> is left untouched.

type EdgeContext = { next(): Promise<Response> };

const ORG = "Krystals Flower Creations";
// Preferred domain for og:url/canonical (matches index.html og:url).
const SITE = "https://krystalsflowercreations.com.au";

// Link-preview scrapers + search/AI crawlers. The generic tail catches new
// preview bots; injection is content-correct for any consumer, so over-matching
// is safe (humans are excluded by their real browser UAs).
const BOT_RE = /(facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|slack-imgexp|discordbot|telegrambot|linkedinbot|pinterest|skypeuripreview|googlebot|bingbot|duckduckbot|yandex|applebot|naverbot|baiduspider|petalbot|bytespider|meta-externalagent|gptbot|claudebot|anthropic-ai|perplexitybot|ccbot|ia_archiver|embedly|quora|outbrain|vkshare|w3c_validator|bot|spider|crawler|preview|slurp|fetch)/i;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const abs = (u: unknown, base: URL) => {
  const s = String(u || "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : new URL(s.startsWith("/") ? s : `/${s}`, base).href;
};

const desc170 = (v: unknown) =>
  String(v || "").replace(/\s+/g, " ").trim().slice(0, 170);

async function fetchJson(path: string, base: URL): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(new URL(path, base), {
      headers: { accept: "application/json" },
      // Prod API latency is high (functions in us-east, DB in ap-southeast-2 —
      // each Prisma relation include is a hemisphere round trip; /api/products/:slug
      // measures ~6-7s). 5s aborted every product/post fetch; 15s stays well
      // inside the 40s edge response-header timeout and fetch wait does not
      // count against the 50ms CPU budget.
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type Tags = {
  title: string;
  description: string;
  path: string;
  ogType: string;
  image: string | null;
  imageAlt?: string;
  publishedTime?: string | null;
};

// Mirrors SiteLayout.jsx ROUTE_TITLES / ROUTE_DESCRIPTIONS (skip utility
// routes — cart/checkout/login/configurator/notebook are not registered here).
const STATIC: Record<string, { title: string; description: string }> = {
  "/": {
    title: `${ORG} — Paper Florist Perth WA`,
    description:
      "Everlasting paper bouquets that never wilt. Custom Cricut + origami blooms, Perth studio. Shop, configurator & workshops — GST inclusive, free Perth delivery over $150.",
  },
  "/shop": {
    title: `Shop paper blooms — ${ORG}`,
    description:
      "Shop handmade paper flowers — everlasting bouquets, Cricut SVG templates & sculptural art from our Perth studio. GST inclusive, free Perth delivery over $150.",
  },
  "/blog": {
    title: `Journal — ${ORG}`,
    description:
      "Journal — paper florist tutorials, Cricut settings for Perth humidity, origami folds and studio behind-the-scenes.",
  },
  "/workshops": {
    title: `Workshops — ${ORG}`,
    description:
      "Paper flower workshops in Perth — Cricut Blooms 101, Origami Bouquet & Sculptural Art. Kits included, max 12 per class.",
  },
  "/loyalty": {
    title: `Bloom Points — ${ORG}`,
    description:
      "Bloom Points — earn 1 point per $1 at Krystals Flower Creations and redeem on paper blooms.",
  },
  "/about": {
    title: `About — ${ORG}`,
    description:
      "About Krystals Flower Creations — Perth paper florist studio making everlasting bouquets, sculptural art and workshop kits.",
  },
  "/privacy": {
    title: `Privacy Policy — ${ORG}`,
    description: `Privacy policy — Krystals Flower Creations, Perth WA.`,
  },
};

// Mirrors Occasion.jsx KNOWN titles + slugifyLabel.
const OCCASION_TITLES: Record<string, string> = {
  wedding: "Wedding Flowers",
  birthday: "Birthday Flowers",
  "mothers-day": "Mother's Day Flowers",
  anniversary: "Anniversary Flowers",
  sympathy: "Sympathy Flowers",
  graduation: "Graduation Flowers",
  housewarming: "Housewarming Flowers",
};
const slugifyLabel = (s: string) =>
  s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const staticTags = (path: string, base: URL): Tags => {
  const t = STATIC[path];
  return {
    title: t.title,
    description: t.description,
    path,
    ogType: "website",
    image: `${base.origin}/og-cover.jpg`,
  };
};

// Per-route tags, or null when the path is unknown / the API has no data —
// null leaves the origin <head> untouched (homepage defaults stay).
async function buildTags(path: string, base: URL): Promise<Tags | null> {
  const product = path.match(/^\/product\/([a-z0-9-]+)$/);
  if (product) {
    const p = await fetchJson(`/api/products/${product[1]}`, base);
    if (!p?.title) return null;
    const image = Array.isArray(p.images) && (p.images as any[])[0]?.url
      ? abs((p.images as any[])[0].url, base)
      : `${base.origin}/og-cover.jpg`;
    return {
      title: `${String(p.title)} — ${ORG}`,
      description: desc170(p.metaDescription || p.description),
      path,
      ogType: "website",
      image,
      imageAlt: String(p.title),
    };
  }

  const blog = path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blog) {
    const p = await fetchJson(`/api/posts/${blog[1]}`, base);
    if (!p?.title) return null;
    return {
      title: String(p.metaTitle || `${String(p.title)} | ${ORG}`).slice(0, 70),
      description: desc170(p.metaDescription || p.excerpt),
      path,
      ogType: "article",
      image: p.coverImageUrl ? abs(p.coverImageUrl, base) : `${base.origin}/og-cover.jpg`,
      imageAlt: String(p.title),
      publishedTime: p.publishedAt ? new Date(String(p.publishedAt)).toISOString() : null,
    };
  }

  const occ = path.match(/^\/occasions\/([a-z0-9-]+)$/);
  if (occ) {
    // Same formula as Occasion.jsx (settings-driven free-shipping threshold
    // falls back to $150 there too when unset).
    const label = OCCASION_TITLES[occ[1]] || `${slugifyLabel(occ[1])} Flowers`;
    return {
      title: `${label} Perth WA — ${ORG}`,
      description: `${label} in Perth — handmade everlasting paper flowers from Krystals Flower Creations. Made to order, GST inclusive, free Perth delivery over $150.`,
      path,
      ogType: "website",
      image: `${base.origin}/og-cover.jpg`,
    };
  }

  if (STATIC[path]) return staticTags(path, base);
  return null;
}

function metaTag(attr: "property" | "name", key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${esc(content)}">`;
}

function injectHead(html: string, t: Tags): string {
  const siteUrl = `${SITE}${t.path}`;
  const tags = [
    metaTag("property", "og:title", t.title),
    metaTag("property", "og:description", t.description),
    metaTag("property", "og:type", t.ogType),
    metaTag("property", "og:url", siteUrl),
    metaTag("property", "og:site_name", ORG),
    metaTag("name", "description", t.description),
    metaTag("name", "twitter:card", t.image ? "summary_large_image" : "summary"),
    metaTag("name", "twitter:title", t.title),
    metaTag("name", "twitter:description", t.description),
    `<link rel="canonical" href="${esc(siteUrl)}">`,
  ];
  if (t.image) {
    tags.push(metaTag("property", "og:image", t.image));
    if (t.imageAlt) tags.push(metaTag("property", "og:image:alt", t.imageAlt));
    tags.push(metaTag("name", "twitter:image", t.image));
  }
  if (t.publishedTime) tags.push(metaTag("property", "article:published_time", t.publishedTime));

  return html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${esc(t.title)}</title>`)
    .replace(/<meta\b[^>]*\bproperty=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\b[^>]*\bname=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, "")
    .replace(/<\/head>/i, `${tags.join("\n")}\n</head>`);
}

export default async function meta(request: Request, context: EdgeContext): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  if ((request.headers.get("accept") || "").toLowerCase().includes("text/markdown")) return;
  if (!BOT_RE.test(request.headers.get("user-agent") || "")) return;

  const origin = await context.next();
  const fallback = origin.clone(); // untouched HTML for the error path
  try {
    if (!origin.ok || !(origin.headers.get("content-type") || "").includes("text/html")) return origin;
    const html = await origin.text();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const tags = await buildTags(path, url);
    if (!tags || !/<\/head>/i.test(html)) return fallback;
    return new Response(injectHead(html, tags), origin);
  } catch {
    return fallback;
  }
}
