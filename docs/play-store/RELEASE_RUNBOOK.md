# Release Runbook — Krystal's Flower Kreations Android

## Build production AAB
eas build --platform android --profile production

## Submit to Play Console (internal track, draft)
eas submit --platform android

## Tracks
internal -> closed -> production (10% -> 50% -> 100%)

## OTA updates
eas update --channel production --message "patch"