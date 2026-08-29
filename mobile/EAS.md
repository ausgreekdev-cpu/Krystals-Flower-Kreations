# EAS Build & Play Store Submit — Krystal's Flower Kreations

## Prereqs (Do Once)

```bash
npm install -g eas-cli
eas login                 # Expo account (create at expo.dev)
eas project:init          # links to expo.dev projectId → writes to app.json extra.eas.projectId
```

## Local Secrets (DO NOT COMMIT)

- `mobile/pc-api-key.json` — Google Play service account JSON (Play Console → Setup → API access → Create service account → Grant to “Admin (all permissions)”)
- `mobile/.env` / EAS secrets:
  ```bash
  eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.krystalsflowerkreations.com.au
  eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://xyz.supabase.co
  eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
  ```

## Build

```bash
cd mobile
# Test APK (shareable, not for store)
eas build --platform android --profile preview

# Production AAB for Play Store (autoIncrement versionCode, app-bundle)
eas build --platform android --profile production
# or locally (requires Android SDK + build tools)
npx expo prebuild --platform android --clean
cd android && ./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

Signing: EAS auto-generates upload keystore (managed). To use your own `.jks`:

```bash
eas credentials
# Android → production → Keystore → Update → Provide .jks + alias + passwords
```

## Submit

```bash
# After build completes:
eas submit --platform android --profile production --latest
# First submission must be manual: upload AAB via Play Console → Create app → Production → Create new release (draft)
```

Versioning: `app.json: android.versionCode` auto-increments (`autoIncrement:true`). Keep `expo.version 1.0.0` → bumps to `1.0.1` for patches, `1.1.0` for minor. Play requires increasing `versionCode` each upload (even after rejection).

Target SDK: 35 (Android 15) via `expo-build-properties` `compileSdk 35 / targetSdk 35 / minSdk 24` — meets Play 2024+ requirement 34+. Proguard + shrinkResources enabled for smaller AAB.
