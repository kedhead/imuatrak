# Assets

Drop the following PNGs in here — they're referenced from `app.config.ts`:

- `icon.png` — 1024×1024 app icon (RGB, no alpha) for iOS
- `adaptive-icon.png` — 1024×1024 foreground for the Android adaptive icon
- `splash.png` — 1284×2778 splash image (iPhone 14 Pro Max safe), centered
  on the Paddleup blue background

Placeholder PNGs ship with `npx create-expo-app`; running
`npx expo prebuild --clean` will also regenerate them. Until then the app
will fall back to the default Expo splash, which is fine for development.
