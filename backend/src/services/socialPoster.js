// Social media posting — Facebook Page + Instagram Business via Meta Graph API.
// Requires: META_ACCESS_TOKEN (page token), META_PAGE_ID, META_IG_USER_ID.
// Posts are best-effort: failures are logged, never block the calling flow.
import { isProductionLike } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v19.0';

function configured() {
  return Boolean(process.env.META_ACCESS_TOKEN && (process.env.META_PAGE_ID || process.env.META_IG_USER_ID));
}

/**
 * Post a product announcement to Facebook Page.
 * @param {object} product - { title, description, price, slug, images }
 * @returns {Promise<{ status, postId?, error? }>}
 */
export async function postProductToFacebook(product) {
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) return { status: 'disabled', reason: 'Meta not configured — set META_PAGE_ID + META_ACCESS_TOKEN' };

  const caption = `✨ New in store: ${product.title}\n\n${(product.description || '').slice(0, 500)}\n\n💰 $${Number(product.price).toFixed(2)} AUD\n🛒 ${process.env.FRONTEND_URL}/product/${product.slug}\n\n#paperflowers #handmadeinperth #everlastingflowers #cricut`;
  const imageUrl = product.images?.[0]?.url || product.ogImageUrl || '';

  try {
    const body = { message: caption, access_token: token };
    if (imageUrl) body.link = `${process.env.FRONTEND_URL}/product/${product.slug}`;

    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data.error?.message || res.statusText };
    return { status: 'posted', postId: data.id, platform: 'facebook' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

/**
 * Post a product announcement to Instagram (requires image).
 * @param {object} product
 * @returns {Promise<{ status, postId?, error? }>}
 */
export async function postProductToInstagram(product) {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || !igUserId) return { status: 'disabled', reason: 'Meta not configured — set META_IG_USER_ID + META_ACCESS_TOKEN' };

  const imageUrl = product.images?.[0]?.url || product.ogImageUrl || '';
  if (!imageUrl) return { status: 'skipped', reason: 'No image available for Instagram post' };

  const caption = `✨ ${product.title}\n\n${(product.description || '').slice(0, 300)}\n\n💰 $${Number(product.price).toFixed(2)} AUD\n🛒 Link in bio\n\n#paperflowers #handmadeinperth #everlastingflowers #cricut #paperart`;

  try {
    // Step 1: Create media container
    const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) return { status: 'error', error: createData.error?.message || createRes.statusText };

    // Step 2: Publish
    const pubRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: createData.id, access_token: token }),
    });
    const pubData = await pubRes.json();
    if (!pubRes.ok) return { status: 'error', error: pubData.error?.message || pubRes.statusText };
    return { status: 'posted', postId: pubData.id, platform: 'instagram' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

/**
 * Post a workshop announcement.
 * @param {object} workshop - { title, description, price, slug }
 */
export async function postWorkshopToSocial(workshop) {
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) return { status: 'disabled', reason: 'Meta not configured' };

  const caption = `🎓 New workshop: ${workshop.title}\n\n${(workshop.description || '').slice(0, 500)}\n\n💰 $${Number(workshop.price).toFixed(2)} AUD\n📍 Perth Studio\n📅 Book now: ${process.env.FRONTEND_URL}/workshops\n\n#paperflowers #workshop #perth #handmadeinperth #cricut #origami`;

  try {
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: caption, access_token: token }),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data.error?.message || res.statusText };
    return { status: 'posted', postId: data.id, platform: 'facebook' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

export { configured };