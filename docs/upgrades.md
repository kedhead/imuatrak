# Keeping up to date

How this app stays current with Expo, React Native and the build toolchain, and
the record of each upgrade.

## Why it matters here

EAS builds use `"image": "latest"` (eas.json), so the build machines move to
each new Xcode as soon as Expo publishes it. That is deliberate: Apple requires
recent Xcode for App Store submission, and pinning an old image only postpones
the same break.

The catch is that each Expo SDK is built and tested against a particular Xcode.
An app that falls behind on SDKs eventually meets a toolchain its SDK predates,
and the build fails. That is exactly what happened in October 2026: the app was
on SDK 56, Expo was on 58, EAS moved to Xcode 27, and the first 1.0.7 build
failed — Xcode 27 rejects any target below iOS 15, and several libraries' pods
still declared iOS 9–13. (Pinning the image to the SDK isn't available — EAS deprecated the
`default` and `stable` aliases.)

So the rule is simply: **stay on the current Expo SDK.**

## How falling behind gets noticed

`.github/workflows/dependency-watch.yml` runs every Monday (and on demand from
the Actions tab). It runs `scripts/check-updates.mjs`, which reports:

1. a newer Expo SDK than the one installed;
2. packages that have drifted from the installed SDK's compatibility list
   (`expo install --check`);
3. native libraries **outside** Expo's list — which nothing else watches — that
   are a major version behind, plus `firebase`.

When there is something to do it opens one GitHub issue labelled `dependencies`
(updating it on later runs instead of opening more), and closes it once
everything is current. It never changes code.

## Upgrading an SDK

One SDK per upgrade, in its own commit and its own store build.

1. **Read the breaking changes.** Root changelog:
   `https://raw.githubusercontent.com/expo/expo/sdk-NN/CHANGELOG.md`; per-package
   changelogs are under `packages/<name>/CHANGELOG.md` on the same branch.
   Check only the packages in package.json.
2. `npm install expo@~NN.x.y`, then `npx expo install --fix`. If the sandbox
   can't reach Expo's API, `EXPO_OFFLINE=1 npx expo install --fix` uses the
   list bundled inside the `expo` package.
3. **Re-pin the exact pins.** `expo-camera`, `expo-media-library` and
   `react-native-keyboard-controller` are pinned to an exact version on purpose:
   1.0.3 crashed at launch when a range resolved expo-camera to a patch built
   against a newer ExpoModulesCore than the one shipped. Pin each to the exact
   version in `node_modules/expo/bundledNativeModules.json`.
4. Update dev tooling to the SDK's template (`npm view
   expo-template-blank-typescript@sdk-NN devDependencies`), plus `jest-expo`,
   `eslint-config-expo`, `@react-native/jest-preset`.
5. Update the native libraries outside Expo's list (the `UNMANAGED_NATIVE` list
   in scripts/check-updates.mjs) and read their changelogs.
6. Bump `node-version` in the workflows if the SDK raised its Node floor (the
   `engines` field of the `expo` package).
7. `npm run typecheck && npm run lint && npm test`.
8. **Prebuild locally** to prove every config plugin still runs:
   `APPLE_TEAM_ID=X npx expo prebuild --no-install --platform all`. Then check
   the generated `android/gradle.properties` for new defaults (see R8 below),
   delete `ios/` and `android/`.
9. Bump the version and both OTA runtimes in the same commit (see app.config.js)
   unless the current version has never produced a binary.

## Record

### SDK 56 → 58 (2026-10-19, ships in 1.0.7)

React Native 0.85 → 0.88, React 19.2 → 19.3, TypeScript 5.6 → 6.0.

- **Breaking changes reviewed** for every package the app uses; none of the
  removed APIs were in use. `expo-file-system/legacy` and
  `expo-media-library/legacy` still exist. expo-notifications now shows
  foreground notifications by default, but the app already sets its own
  handler, so nothing changes.
- **Android Gradle Plugin 9.** The SDK 58 template sets
  `android.builtInKotlin=false` and `android.newDsl=false`, which keeps
  libraries that still apply the `kotlin-android` plugin working — that is most
  of ours, including `modules/wear-bridge`.
- **R8 is held OFF.** SDK 58's template turns release minification on by
  default (SDK 56's had it off). `enableMinifyInReleaseBuilds: false` in
  expo-build-properties keeps the upgrade from silently shipping R8 too. Turning
  it on is still the first change of its own cycle — docs/backlog.md.
- **Library majors:** `@bacons/apple-targets` 4 → 5 (config format unchanged),
  `react-native-google-mobile-ads` 16 → 17 (required: 17 needs RN ≥ 0.86),
  `react-native-gesture-handler` 2 → 3.
- **Removed two unused native modules**, `react-native-nitro-modules` and
  `react-native-health-connect`: nothing imported either, and each would have had
  to compile under the new toolchain for nothing. Health Connect export was
  already disabled (src/services/health.ts); re-add the package at a current
  version if that work resumes.
- **TypeScript 6** no longer auto-includes `@types/*`, so tsconfig names `jest`.
  RN 0.88 tightened types: list header/empty props no longer take `null`, the
  `TextInput` ref is `React.ComponentRef<typeof TextInput>`, native event
  payloads are `Object`, and `ColorValue` can be a number or null.
- **Lint:** eslint-config-expo 58 adds React Compiler readiness rules as errors.
  The compiler isn't enabled, so they're warnings (see .eslintrc.js); two cases
  that were just better written were fixed. `import/namespace` is off — it gave
  a false positive on `Notifications.AndroidImportance`, which TypeScript
  already checks correctly.
- **The actual build failure: pod deployment targets.** Xcode 27 supports iOS
  15+ and treats anything lower as an **error**. Fourteen resource-bundle targets
  from third-party pods (Google Sign-In, GoogleUtilities, AppAuth,
  GTMSessionFetcher, Promises, AdMob, UserMessagingPlatform, RevenueCat,
  async-storage, react-native-svg, ReachabilitySwift) declare iOS 9–13; those 14
  errors were the whole of the failed 1.0.7 log. They come from the libraries, so
  the SDK upgrade doesn't remove them. `plugins/withPodDeploymentTarget.js` raises
  pods below the app's minimum (16.4) up to it. Its Podfile hook was run against
  those exact targets and values with a Ruby harness, since `pod install` isn't
  available here.
- **CI** moved to Node 22 (SDK 58 requires ≥ 22.13).

Validated by typecheck, lint, the test suite, and a full local prebuild of both
platforms (watch target, entitlements, Podfile, Gradle properties, Android
permissions all inspected). **Not compiled** — there is no Xcode or Android SDK
in the environment that made the change, so the first EAS build is the compile
test.

### Follow-ups

- **Firebase JS SDK 11 → 13.** Two majors; JavaScript only, so it doesn't affect
  native builds and can go out over OTA once 1.0.7 is live. Separate change.
- **Gesture handler's legacy API.** `src/ui/ZoomableImage.tsx` uses the
  `Gesture.Pinch()`-style builder, which gesture-handler 3 still supports but now
  labels "Legacy". Move it to the v3 hooks (`usePinchGesture` …) before
  gesture-handler 4.
- **React Compiler.** The warnings in `npm run lint` are the to-do list for
  turning it on.
