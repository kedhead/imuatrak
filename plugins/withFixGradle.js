const { withAppBuildGradle } = require("@expo/config-plugins");

// enableBundleCompression was removed from ReactExtension in RN 0.73+.
// The Expo prebuild template still emits it, which breaks the Gradle build.
module.exports = function withFixGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /[ \t]*enableBundleCompression\s*=[^\n]*\n/,
      "",
    );
    return cfg;
  });
};
