// Autolinking manifest: Android-only native module (iOS uses the separate
// WatchBridge pod; src/index.ts no-ops there).
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "android",
        packageImportPath: "import app.imuatrak.wearbridge.WearBridgePackage;",
        packageInstance: "new WearBridgePackage()",
      },
      ios: null,
    },
  },
};
