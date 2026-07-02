const { withXcodeProjectBeta } = require("@bacons/apple-targets/build/with-bacons-xcode");

/**
 * withWatchVersionSync — Expo config plugin
 *
 * @bacons/apple-targets hardcodes MARKETING_VERSION = "1.0" on the watch
 * target's build configurations, but App Store validation requires the watch
 * app's CFBundleShortVersionString to match the companion iOS app. This mod
 * rewrites the watch configurations to the app version from Expo config.
 *
 * IMPORTANT: must be listed BEFORE "@bacons/apple-targets" in the plugins
 * array. Mods execute in reverse registration order, so registering earlier
 * makes this run after the watch target has been created — and the targets
 * plugin registers the pbxproj provider last, which forbids adding mods
 * after it.
 */
const WATCH_BUNDLE_ID = "app.imuatrak.watchkitapp";

const withWatchVersionSync = (config) => {
  return withXcodeProjectBeta(config, (cfg) => {
    const project = cfg.modResults;
    const version = cfg.version ?? "1.0";

    for (const target of project.rootObject.props.targets) {
      const configurations = target.props.buildConfigurationList?.props.buildConfigurations ?? [];
      for (const buildConfig of configurations) {
        const settings = buildConfig.props.buildSettings;
        if (settings?.PRODUCT_BUNDLE_IDENTIFIER === WATCH_BUNDLE_ID) {
          settings.MARKETING_VERSION = version;
        }
      }
    }
    return cfg;
  });
};

module.exports = withWatchVersionSync;
