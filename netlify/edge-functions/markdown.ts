// markdown — serve content pages as text/markdown when an AI agent asks for it
// (Accept: text/markdown), cutting token usage ~80% vs the HTML page.
//
// ── How to test ──────────────────────────────────────────────────────────
// Against production:
//   curl -H "Accept: text/markdown" https://krystalsflowercreations.com.au/blog
//   curl -H "Accept: text/markdown" https://krystalsflowercreations.com.au/product/paper-peony-ivory-single
//   (no header → normal HTML pass-through)
//
// ── How to add or remove paths ───────────────────────────────────────────
// The function does NOT hardcode its scope — paths are registered in
// netlify.toml under [[edge_functions]] blocks with function = "markdown".
// Add a block (or a path line inside an existing one), remove one, redeploy.
// Patterns: "/blog", "/blog/*". Utility routes (cart, checkout, login,
// configurator, notebook, admin, pos, kanban) and /api/*, /assets/* are
// intentionally unregistered — they never hit this function.
//
// ── Local testing ────────────────────────────────────────────────────────
//   npx netlify-cli dev
//   curl -H "Accept: text/markdown" http://localhost:8888/blog
//   curl http://localhost:8888/blog   # unchanged HTML
//
// ── Pipeline ─────────────────────────────────────────────────────────────
// Accept check → origin HTML (context.next()) → strip chrome (scripts, styles,
// nav/header/footer/aside) → API enrichment for client-rendered routes (this
// site is a React SPA, so the origin HTML is a shell; real content comes from
// /api/posts and /api/products) → Turndown (npm turndown, installed at repo root
// by netlify-build.sh via --include-workspace-root) → Markdown response
// with X-Markdown-Tokens + Content-Signal headers. ANY failure falls back to
// the original HTML response untouched.

import TurndownService from "turndown";

type EdgeContext = { next(): Promise<Response> };
type Enriched = { html?: string; markdown?: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textOf = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function metaContent(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"));
  return (m?.[1] || "").trim();
}

function stripChrome(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<form\b[\s\S]*?<\/form>/gi, "");
}

async function fetchJson(path: string, base: URL): Promise<unknown> {
  try {
    const res = await fetch(new URL(path, base), {
      headers: { accept: "application/json" },
      // Prod API latency is high (us-east functions vs ap-southeast-2 DB —
      // /api/products/:slug measures ~6-7s), so 5s aborted every product
      // enrich; 15s stays inside the 40s edge response-header timeout.
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const productListItems = (list: Record<string, unknown>[], href: (p: any) => string, suffix?: (p: any) => string) =>
  `<ul>${list.map((p) => `<li><a href="${href(p)}">${esc(p.title)}</a>${suffix ? ` — ${esc(suffix(p))}` : ""}</li>`).join("")}</ul>`;

// Real content for client-rendered routes, from the site's own JSON APIs.
async function enrich(url: URL): Promise<Enriched | null> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const base = url;

  if (path === "/blog") {
    const posts = await fetchJson("/api/posts", base);
    if (!Array.isArray(posts) || !posts.length) return null;
    const list = (posts as any[]).slice(0, 40);
    return {
      html:
        "<h1>Journal — Krystals Flower Creations</h1>" +
        productListItems(list, (p) => `/blog/${p.slug}`, (p) => p.excerpt || ""),
    };
  }

  const blog = path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blog) {
    const post = (await fetchJson(`/api/posts/${blog[1]}`, base)) as Record<string, unknown> | null;
    if (!post?.title) return null;
    const meta = [post.publishedAt ? new Date(String(post.publishedAt)).toLocaleDateString("en-AU") : "", post.tags]
      .filter(Boolean).join(" · ");
    // Post bodies are already Markdown — Turndown would flatten "## " headings,
    // so emit the content directly with a title header prepended.
    return {
      markdown: `# ${post.title}\n${meta ? `\n*${meta}*\n` : ""}\n${String(post.content || post.excerpt || "").trim()}\n`,
    };
  }

  const prod = path.match(/^\/product\/([a-z0-9-]+)$/);
  if (prod) {
    const p = (await fetchJson(`/api/products/${prod[1]}`, base)) as Record<string, unknown> | null;
    if (!p?.title) return null;
    const facts = [`$${Number(p.price).toFixed(2)} AUD`, p.type, p.flowerType, p.colourFamily]
      .filter(Boolean).map(String);
    const paras = String(p.description || "").split(/\n{2,}/).filter(Boolean)
      .map((t) => `<p>${esc(t)}</p>`).join("");
    const occasions = Array.isArray(p.occasions) ? (p.occasions as string[]) : [];
    return {
      html:
        `<h1>${esc(p.title)}</h1><p>${facts.map(esc).join(" · ")}</p>${paras}` +
        (p.careInstructions ? `<p><strong>Care:</strong> ${esc(p.careInstructions)}</p>` : "") +
        (occasions.length ? `<p><strong>Perfect for:</strong> ${esc(occasions.join(", "))}</p>` : ""),
    };
  }

  if (path === "/shop") {
    const data = (await fetchJson("/api/products?limit=40", base)) as { products?: any[] } | null;
    const list = data?.products || [];
    if (!list.length) return null;
    return {
      html: "<h1>Shop — everlasting paper flowers &amp; bouquets</h1>" +
        productListItems(list, (p) => `/product/${p.slug}`, (p) => `$${Number(p.price).toFixed(2)}`),
    };
  }

  const occ = path.match(/^\/occasions\/([a-z0-9-]+)$/);
  if (occ) {
    const data = (await fetchJson(`/api/products?occasion=${occ[1]}&limit=40`, base)) as { products?: any[] } | null;
    const list = data?.products || [];
    const label = occ[1].replace(/-/g, " ");
    return {
      html: `<h1>Paper flowers for ${esc(label)}</h1>` +
        (list.length
          ? productListItems(list, (p) => `/product/${p.slug}`, (p) => `$${Number(p.price).toFixed(2)}`)
          : "<p>No matching products right now — see the shop for all bouquets.</p>"),
    };
  }

  return null;
}

export default async function markdown(request: Request, context: EdgeContext): Promise<Response> {
  if (!(request.headers.get("accept") || "").toLowerCase().includes("text/markdown")) {
    return context.next(); // browsers and normal clients: origin, unchanged
  }

  const origin = await context.next();
  const fallback = origin.clone(); // untouched HTML for the error path

  try {
    if (!origin.ok || !(origin.headers.get("content-type") || "").includes("text/html")) return origin;

    const html = await origin.text();
    const url = new URL(request.url);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim() ||
      "Krystals Flower Creations";
    const desc = metaContent(html, "description");

    const enriched = await enrich(url);
    let md: string;
    if (enriched?.markdown) {
      md = enriched.markdown;
    } else {
      let body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
      body = stripChrome(body);
      // SPA shell (no rendered text) → fall back to title + meta description
      const fragment = enriched?.html ??
        (textOf(body).length >= 80 ? body : `<h1>${esc(title)}</h1><p>${esc(desc)}</p>`);
      md = new TurndownService({ headingStyle: "atx", hr: "---" }).turndown(fragment);
    }

    md = md.trim();
    if (!md) throw new Error("empty markdown");

    return new Response(md + "\n", {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "x-markdown-tokens": String(Math.ceil(md.length / 4)),
        "content-signal": "ai-train=yes, search=yes, ai-input=yes",
        vary: "Accept",
        "cache-control": "public, max-age=60",
      },
    });
  } catch {
    return fallback; // any error → original HTML, never a broken response
  }
}
