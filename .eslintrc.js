module.exports = {
  root: true,
  extends: ["expo"],
  ignorePatterns: ["dist", "ios", "android", "node_modules", "firebase/functions"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
