#!/usr/bin/env node
// Fails if any native dependency is not pinned to an exact version that
// matches what is installed.
//
// Why: iOS builds link Expo's PRECOMPILED frameworks, each compiled against a
// specific expo-modules-core. A `~`/`^` range lets npm pick a patch released
// for a newer SDK point release, which builds fine and then dies at launch
// with "Symbol not found" — that crashed 1.0.8 and the first 1.0.9 build.
// Bump native packages deliberately (expo install / a version matched to the
// installed expo-modules-core), never by letting a range float.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const problems = [];

const isNative = (name) => {
  const dir = join("node_modules", name);
  if (name === "expo" || name.startsWith("expo-") || name.startsWith("react-native")) return true;
  return ["ios", "android", "expo-module.config.json", "react-native.config.js", "local-maven-repo"].some((f) =>
    existsSync(join(dir, f)),
  );
};

for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (spec.startsWith("file:")) continue; // in-repo modules, built from source
  if (!isNative(name)) continue;
  const installedPath = join("node_modules", name, "package.json");
  const installed = existsSync(installedPath) ? JSON.parse(readFileSync(installedPath, "utf8")).version : null;
  if (!EXACT.test(spec)) problems.push(`${name}: "${spec}" is a range; pin it exactly (installed ${installed ?? "?"})`);
  else if (installed && installed !== spec) problems.push(`${name}: package.json says ${spec} but ${installed} is installed`);
}

if (problems.length) {
  console.error("Native dependencies must be pinned to exact versions:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("✓ native dependencies pinned exactly");
