const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

/**
 * withWatchBridge — Expo config plugin
 *
 * Adds the WatchBridge local pod to the iOS Podfile so WatchConnectivity
 * works at runtime. The pod declares its own source files and frameworks
 * via WatchBridge.podspec, avoiding direct pbxproj manipulation.
 */
const withWatchBridge = (config) => {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");

      if (!fs.existsSync(podfilePath)) return cfg;

      let podfile = fs.readFileSync(podfilePath, "utf8");

      const podLine = "  pod 'WatchBridge', :path => '../modules/watch-bridge'";

      if (!podfile.includes(podLine)) {
        // Insert after the `use_expo_modules!` line which is always present
        podfile = podfile.replace(
          /([ \t]*use_expo_modules!)/,
          `$1\n${podLine}`
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return cfg;
    },
  ]);
};

module.exports = withWatchBridge;
