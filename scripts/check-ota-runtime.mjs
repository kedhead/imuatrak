#!/usr/bin/env node
// Preflight for `npm run deploy:ota`.
//
// The OTA runtime in app.config.js must equal the runtime of the binary users
// actually have installed. When it does not, `eas update` still uploads, still
// prints "Published!", and reaches nobody — there is no error to notice. That
// has happened twice on this project: builds sat on runtime 0.1.0 while
// updates went to 1.0.1, and six days of August updates went to 1.0.3 for a
// build that was never made. Android's entire post-launch feature gap came
// from the same failure, in the other direction.
//
// So: before publishing, compare what app.config.js declares against the most
// recent production build EAS actually has for each platform, and refuse to
// continue on a mismatch.
//
// A definite mismatch exits 1 and blocks the publish. Anything that merely
// prevents the check from running (offline, not logged in, no builds yet)
// warns and exits 0 — this must never be the thing standing between you and
// an emergency fix. `deploy:ota:rollback` has no preflight at all.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const PLATFORMS = ["ios", "android"];
const CHANNEL = "production";
const PROFILE = "production";

function warn(msg) {
  console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`);
}

/** Runtime versions this repo would publish, per platform. */
function declaredRuntimes() {
  const config = require("../app.config.js");
  return Object.fromEntries(PLATFORMS.map((p) => [p, config[p]?.runtimeVersion]));
}

/**
 * The newest finished production build EAS holds for a platform, or null if
 * the query could not be answered for any reason.
 */
function latestBuild(platform) {
  let stdout;
  try {
    // `eas` off PATH, the same binary `deploy:ota` itself invokes — so if this
    // cannot run, neither can the publish it is guarding. `shell` on Windows
    // because the CLI is installed there as `eas.cmd`; every argument below is
    // a bare token, so there is nothing for the shell to mis-quote.
    stdout = execFileSync(
      "eas",
      [
        "build:list",
        "--json",
        "--non-interactive",
        "--platform",
        platform,
        "--status",
        "finished",
        "--buildProfile",
        PROFILE,
        "--limit",
        "1",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 90_000,
        shell: process.platform === "win32",
      },
    );
  } catch {
    return null;
  }
  try {
    const builds = JSON.parse(stdout);
    return Array.isArray(builds) && builds.length > 0 ? builds[0] : null;
  } catch {
    return null;
  }
}

const declared = declaredRuntimes();
const problems = [];
let checked = 0;

console.log("Checking OTA runtime versions against the builds EAS has…\n");

for (const platform of PLATFORMS) {
  const want = declared[platform];
  if (!want) {
    problems.push(
      `${platform}: app.config.js declares no ${platform}.runtimeVersion. ` +
        `Updates for this platform cannot be targeted at anything.`,
    );
    continue;
  }

  const build = latestBuild(platform);
  if (!build) {
    warn(
      `${platform}: could not read the latest ${PROFILE} build from EAS ` +
        `(offline, not logged in, or no build yet). Declared runtime is ${want} — ` +
        `verify by hand against expo.dev → Builds before trusting this publish.`,
    );
    continue;
  }

  checked++;
  const got = build.runtimeVersion;
  const built = build.appVersion ?? "?";
  const label = `${platform}: config says ${want}, latest ${PROFILE} build (${built}) is ${got}`;

  if (got !== want) {
    problems.push(
      `${label} — MISMATCH. An update published now would not reach that build. ` +
        `Set ${platform}.runtimeVersion to ${got}, or rebuild the app.`,
    );
  } else if (build.channel && build.channel !== CHANNEL) {
    problems.push(
      `${label} — runtime matches, but that build listens on channel ` +
        `"${build.channel}" and deploy:ota publishes to "${CHANNEL}". ` +
        `The update would not reach it.`,
    );
  } else {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
  }
}

if (problems.length > 0) {
  console.error("\n\x1b[31mOTA preflight failed:\x1b[0m");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\nPublishing anyway would report success and change nothing on those devices.\n" +
      "See docs/deploy-runbook.md → \"Runtime versions are per platform\".",
  );
  process.exit(1);
}

if (checked === 0) {
  warn("\nNothing could be verified against EAS. Continuing, unchecked.");
} else {
  console.log("\nRuntimes line up. Safe to publish.");
}
