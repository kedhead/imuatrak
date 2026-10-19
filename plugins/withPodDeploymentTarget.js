const { withPodfile } = require("@expo/config-plugins");

/**
 * withPodDeploymentTarget — Expo config plugin
 *
 * Raises every CocoaPods target whose IPHONEOS_DEPLOYMENT_TARGET is below the
 * app's own minimum up to that minimum.
 *
 * Many pods still declare iOS 9–13, mostly on their resource-bundle targets.
 * Xcode 27 only supports deployment targets from iOS 15, so each of those
 * produces a "set to 12.0, but the range of supported deployment target
 * versions is 15.0 to 27.1.x" warning. They are harmless, but there are dozens,
 * and they bury the line that actually failed a build — which is exactly what
 * happened on the first SDK 56 build under Xcode 27.
 *
 * Raising them to the app's minimum costs nothing: the app cannot run below it
 * anyway, so no device loses support. The minimum is read from the Podfile's
 * own `ios.deploymentTarget` property (set by expo-build-properties), so this
 * stays in step if that changes.
 */
const MARKER = "# [imuatrak] raise pod deployment targets";

module.exports = function withPodDeploymentTarget(config) {
  return withPodfile(config, (cfg) => {
    let podfile = cfg.modResults.contents;
    if (podfile.includes(MARKER)) return cfg;

    const block = `
    ${MARKER}
    app_min_ios = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new(app_min_ios)
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_min_ios
        end
      end
    end`;

    // After react_native_post_install(...) so nothing it does overrides this.
    const rnPostInstall = /(react_native_post_install\([\s\S]*?\n\s*\))/;
    if (!rnPostInstall.test(podfile)) {
      throw new Error(
        "withPodDeploymentTarget: react_native_post_install(...) not found in the Podfile. " +
          "The Expo template changed; update this plugin.",
      );
    }
    cfg.modResults.contents = podfile.replace(rnPostInstall, `$1\n${block}`);
    return cfg;
  });
};
