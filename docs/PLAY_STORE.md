# Play Store — Submission Checklist (Krystal's Flower Kreations)

**Package:** `com.krystalsflowerkreations.shop` (`mobile/app.json:android.package`) • **Version:** `1.0.0` (`versionCode:1`) • **Target SDK 35** (Android 15, `expo-build-properties`)

## What’s Done (This Commit)

- **Icons:** `mobile/assets/icon.png` 1024, `adaptive-icon.png` 1024 (transparent), `splash.png` 512, `favicon.png` 48, `feature-graphic.png` 1024×500, `notification-icon.png` 96 — all bloom #B85C5C / #FFF7F0 flower.
- **Manifest:** `app.json` updated to `1.0.0` + `android.versionCode:1`, `edgeToEdgeEnabled`, `predictiveBackGestureEnabled`, `compileSdk 35/targetSdk 35/minSdk 24`, proguard/shrink enabled, `BLOCKED` `WRITE_EXTERNAL_STORAGE`, permissions `INTERNET|CAMERA|RECORD_AUDIO|VIBRATE` (CAMERA for QR, RECORD_AUDIO from `expo-image-picker`’s video, VIBRATE for scan feedback), `NSCameraUsageDescription` etc for `expo-camera`.
- **Deprecated fix:** `expo-barcode-scanner` (removed) → `expo-camera` 57 + `expo-build-properties` 0.13 + `expo-system-ui`.
- **Build:** `mobile/eas.json` `production` → `app-bundle` AAB + `autoIncrement`, `submit` → `internal` draft; `mobile/EAS.md` runbook.

## Play Console Steps (Manual, ~45 min)

1. **Play Console → Create app**
   - App name: `Krystal's Flower Kreations`
   - Default language: `English (Australia)`
   - App/access: `App` + `Store`
   - Free + `Shopping` → agree Declarations.

2. **Store listing (Grow → Store presence → Main store listing)**
   - Short desc (≤80): `Perth paper florist — everlasting Cricut + origami bouquets, custom configurator & workshops.`
   - Full desc (use `docs/STORE_LISTING.md`), Icon 512 (use `assets/icon.png`), Feature graphic 1024×500 (`feature-graphic.png`), Screenshots 2-8 (phone 16:9, 7" tablet): Shop, Configurator, Cart, Kanban, Workshop ticket QR.
   - Contact: `krystal@krystalsflowerkreations.com.au`, website `https://krystalsflowerkreations.com.au`, phone `+61 8 XXXX XXXX`, address Perth WA (required for shopping + payments).
   - Categorisation: `Shopping`, tags `flowers, paper craft, Cricut`.
   - Store settings: no ads, no membership.

3. **Privacy, Declarations & Safety**
   - `docs/PRIVACY_POLICY.md` URL required — host at `https://krystalsflowerkreations.com.au/privacy` (template provided, fill ABN).
   - Data safety form: collect `email, name, address, purchase history` — encrypted in transit, not shared, account deletion via `krystal@…` (see `PRIVACY_POLICY`).
   - Target audience 13+, no children, no government, no health.
   - Content rating questionnaire → `Everyone`.

4. **App content & Upload**
   - Content rating: `IARC → Everyone`.
   - `EAS.md` → `eas build --platform android --profile production` → uploads `app-release.aab` (first submit `draft` on `internal` track, promote to `closed` → `production`).
   - Service account: `mobile/pc-api-key.json` (gitignored) for `eas submit`.

5. **Common Rejections to Avoid**
   - Missing 512 icon/feature graphic.
   - `RECORD_AUDIO` without video feature — justify in Data Safety as “optional short video for bouquet preview” or strip with `blockedPermissions` if not used.
   - Privacy policy HTTP 404 — host first.
   - Target SDK <34, `versionCode` not bumped — already 35 + autoIncrement.
   - No in-app account deletion explanation if email login — add to privacy + store listing.

## Next Local Verification (Before Submit)

```bash
cd mobile
npx expo doctor           # expect 0 critical
npx expo prebuild --platform android --clean
cd android && ./gradlew :app:bundleRelease  # or eas build --platform android --profile preview
# Inspect outputs: android/app/build/outputs/bundle/release/app-release.aab + android/app/build/outputs/mapping/release/mapping.txt
```

## Deferred (Not Blocking Store Listing)

- Replace placeholder `EXPO_PUBLIC_API_URL` https placeholder in `eas.json` env with live `api.krystalsflowerkreations.com.au` or Supabase URL.
- Real product screenshots (replace dev picsum) and trimmed `READ_EXTERNAL_STORAGE` notes.
- Upload keystore backup: `eas credentials` → download + vault.
