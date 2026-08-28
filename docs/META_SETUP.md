# Meta (Facebook + Instagram) Shop Integration

This project treats our Postgres as source of truth and pushes to Meta Catalog → Instagram Shopping.

## Steps

1. **Meta Business Manager** — create at business.facebook.com, add your Facebook Page + Instagram Business/Creator (convert IG to Business, connect to Page).
2. **Domain verify** — in Business Settings → Brand Safety → Domains, add `krystalsflowerkreations.com.au` (DNS TXT or meta tag on frontend `index.html`).
3. **Create Catalog** — Commerce Manager → Catalogs → Create, type `Ecommerce`. Note `META_CATALOG_ID`.
4. **Create Meta App** — developers.facebook.com → Create App (Business), add `Marketing API` + `Instagram Graph API`. Copy `META_APP_ID` + `META_APP_SECRET`.
5. **Access token** — Graph Explorer → select App, grant `catalog_management`, `business_management`, `instagram_basic`, `pages_show_list`, `pages_read_engagement`. Generate user token, extend to long-lived (60d), exchange for Page token. Set `META_ACCESS_TOKEN`.
6. **Connect catalog to Shop** — Commerce Manager → catalog → Data Sources → Connect Page + IG. Enable Instagram Shopping → tag products in posts/reels.
7. **Wire env** — in `backend/.env`:
   ```
   META_CATALOG_ID=123456
   META_ACCESS_TOKEN=EAA...
   META_PAGE_ID=...
   META_VERIFY_TOKEN=krystal_verify
   ```
8. **Test sync** — `POST /api/meta/sync/<productId>` or `POST /api/meta/sync-all` (admin token). Check `/api/meta/status` + MetaSyncLog. Verify in Commerce Manager.
9. **Webhooks (optional)** — App → Webhooks → Page + Instagram → subscribe to `feed`, `instagram` → callback `https://your.api/api/meta/webhook?hub.verify_token=krystal_verify`.

## IG Feed Embed (frontend)
Use `instagram_basic` to fetch media or simple embed: `https://www.instagram.com/p/<id>/embed`. Cache in `meta_sync_logs`.

## After Launch
- Pixel + Conversions API for ROAS (add `META_PIXEL_ID` to frontend).
- Product sync cron: `POST /api/meta/sync-all` nightly (PM2/cron).

Troubleshooting: App Review needed for `catalog_management` in live mode — submit with screencast of shop + admin.
