const { withXcodeProject, withInfoPlist, IOSConfig } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

/**
 * withWatchBridge — Expo config plugin
 *
 * Adds the WatchConnectivity framework and WatchBridgeModule Swift files to the
 * iOS Xcode project so WatchConnectivity works at runtime.
 *
 * What it does:
 *  1. Copies WatchBridgeModule.swift + .m into ios/<appName>/
 *  2. Adds both files to the main app target in the .pbxproj
 *  3. Links WatchConnectivity.framework (system, no copy needed)
 *  4. Adds NSWatchConnectivity key to Info.plist (not strictly required but good practice)
 */
const withWatchBridge = (config) => {
  config = withXcodeProject(config, async (cfg) => {
    const proj = cfg.modResults;
    const appName = cfg.modRequest.projectName;
    const iosDir = cfg.modRequest.platformProjectRoot;

    const srcDir = path.join(__dirname, "../modules/watch-bridge/ios");
    const destDir = path.join(iosDir, appName);

    const files = ["WatchBridgeModule.swift", "WatchBridgeModule.m"];

    // Copy source files into ios/<appName>/
    for (const file of files) {
      const src = path.join(srcDir, file);
      const dest = path.join(destDir, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Add files to Xcode project
    const target = proj.getFirstTarget().uuid;
    for (const file of files) {
      const filePath = path.join(appName, file);
      if (!proj.hasFile(filePath)) {
        proj.addSourceFile(filePath, { target });
      }
    }

    // Link WatchConnectivity.framework
    const frameworkName = "WatchConnectivity.framework";
    const existingFrameworks = proj.pbxFrameworksBuildPhaseObj(target).files || [];
    const alreadyLinked = existingFrameworks.some((f) =>
      proj.pbxBuildFileSection()[f.value]?.settings?.ATTRIBUTES !== undefined ||
      proj.pbxFileReferenceSection()[
        proj.pbxBuildFileSection()[f.value]?.fileRef
      ]?.name === frameworkName
    );
    if (!alreadyLinked) {
      proj.addFramework(frameworkName, { weak: false, target });
    }

    return cfg;
  });

  return config;
};

module.exports = withWatchBridge;
