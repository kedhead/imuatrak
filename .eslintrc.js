module.exports = {
  root: true,
  extends: ["expo"],
  ignorePatterns: ["dist", "ios", "android", "node_modules", "firebase/functions", "web"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

    // TypeScript already checks namespace members, and does it correctly. This
    // rule can't follow `export *` re-exports, so since SDK 58 it reports
    // `Notifications.AndroidImportance` as missing when it is present at
    // runtime and in the types. eslint-plugin-import itself recommends turning
    // it off for TypeScript projects.
    "import/namespace": "off",

    // React Compiler readiness rules, which eslint-config-expo 58 enables as
    // errors. The compiler is NOT enabled in this app (see `experiments` in
    // app.config.js), so these describe code the compiler would refuse to
    // optimise, not code that misbehaves today. Kept visible as warnings so
    // they are worked down over time; promote back to errors when turning the
    // compiler on.
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/immutability": "warn",
    "react-hooks/preserve-manual-memoization": "warn",
    "react-hooks/purity": "warn",
  },
};
