#!/usr/bin/env node
// Weekly "are we falling behind?" check, run by .github/workflows/dependency-watch.yml.
//
// Why this exists: EAS builds use `"image": "latest"`, so the build machines
// move to each new Xcode as soon as Expo ships it. That is the right default —
// Apple requires recent Xcode for submission — but it only works while the app
// is on an Expo SDK that supports that Xcode. In October 2026 the app was two
// SDKs behind (56 against a current 58), EAS moved to Xcode 27, and the 1.0.7
// build failed. Nothing had said the app was falling behind until it broke.
//
// This reports, in Markdown on stdout:
//   1. a newer Expo SDK than the one installed;
//   2. packages that have drifted from the installed SDK's compatibility list
//      (`expo install --check`);
//   3. native libraries outside Expo's list that are a major version behind.
//
// Exit 0 = nothing to do. Exit 10 = action needed (the report says what).
// Anything else = the check itself failed. Never modifies the project.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Native libraries Expo's compatibility list does not cover, so nothing else
 * warns when they fall behind. Majors matter most here: a library that drops
 * support for a toolchain is how builds break.
 */
const UNMANAGED_NATIVE = [
  "@bacons/apple-targets",
  "react-native-ble-manager",
  "react-native-google-mobile-ads",
  "@react-native-google-signin/google-signin",
  "react-native-purchases",
];

/** JavaScript-only, but large and security-relevant enough to watch. */
const WATCHED_JS = ["firebase"];

function run(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const major = (v) => Number(String(v).replace(/^[^\d]*/, "").split(".")[0]);
const installed = (pkg) => {
  try {
    return require(`${pkg}/package.json`).version;
  } catch {
    return null;
  }
};
const latest = (pkg) => {
  const r = run("npm", ["view", pkg, "version"]);
  return r.ok ? r.out.trim() : null;
};

const sections = [];

// 1. A newer Expo SDK.
const expoNow = installed("expo");
const expoLatest = latest("expo");
if (expoNow && expoLatest && major(expoLatest) > major(expoNow)) {
  sections.push(
    `### New Expo SDK: ${major(expoLatest)} (installed: ${major(expoNow)})\n\n` +
      `EAS builds on the newest Xcode, and older SDKs stop compiling against it — ` +
      `that is what failed the 1.0.7 build. Upgrade one SDK at a time; ` +
      `docs/upgrades.md has the procedure.`,
  );
}

// 2. Drift from the installed SDK's compatibility list.
const check = run("npx", ["expo", "install", "--check"]);
// `expo install --check` needs Expo's API. If it couldn't reach it, that is not
// drift — say so on stderr and skip, rather than open an issue over a blip.
const networkFailure = /Network Error|ENOTFOUND|ECONNRE|ETIMEDOUT|Forbidden|fetch failed/i.test(check.out);
if (!check.ok && networkFailure) {
  console.error("Skipped the compatibility-list check: couldn't reach Expo's API.");
} else if (!check.ok) {
  sections.push(
    "### Packages out of line with the installed SDK\n\n" +
      "```\n" +
      check.out.trim().split("\n").slice(-30).join("\n") +
      "\n```\n\n" +
      "Fix with `npx expo install --fix`, then re-pin the exact-pinned packages " +
      "(see docs/upgrades.md).",
  );
}

// 3. Libraries outside Expo's list that are a major version behind.
const behind = [];
for (const pkg of [...UNMANAGED_NATIVE, ...WATCHED_JS]) {
  const now = installed(pkg);
  const newest = latest(pkg);
  if (now && newest && major(newest) > major(now)) {
    behind.push(`| \`${pkg}\` | ${now} | ${newest} | ${UNMANAGED_NATIVE.includes(pkg) ? "native" : "JS"} |`);
  }
}
if (behind.length) {
  sections.push(
    "### Libraries a major version behind\n\n" +
      "| Package | Installed | Latest | Kind |\n| --- | --- | --- | --- |\n" +
      behind.join("\n") +
      "\n\nCheck each one's changelog before upgrading; native ones need a store build.",
  );
}

if (sections.length === 0) {
  console.log("Everything is current: Expo SDK, the SDK's compatibility list, and watched libraries.");
  process.exit(0);
}
console.log(
  `Weekly dependency check found ${sections.length} thing(s) to look at.\n\n` + sections.join("\n\n---\n\n"),
);
process.exit(10);
