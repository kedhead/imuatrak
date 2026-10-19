const { withPodfile } = require("@expo/config-plugins");

/**
 * withPodDeploymentTarget — Expo config plugin
 *
 * Raises every CocoaPods target whose IPHONEOS_DEPLOYMENT_TARGET is below the
 * app's own minimum up to that minimum.
 *
 * Many pods still declare iOS 9–13 on their resource-bundle targets
 * (GoogleSignIn, GoogleUtilities, AppAuth, GTMSessionFetcher, Promises,
 * Google Mobile Ads, UserMessagingPlatform, RevenueCat, PurchasesHybridCommon,
 * async-storage, react-native-svg, ReachabilitySwift). Xcode 27 supports
 * deployment targets from iOS 15 only, and it treats a target below that as an
 * ERROR, not a warning:
 *
 *   error: The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to
 *   12.0, but the range of supported deployment target versions is 15.0 to
 *   27.1.x. (in target 'GoogleUtilities-GoogleUtilities_Privacy' ...)
 *
 * Those 14 errors were the entire failure of the first 1.0.7 build — there was
 * no other error in the log. They come from the libraries, not from Expo, so an
 * SDK upgrade does not remove them; this does.
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
        # Only compare real version numbers. A value like '$(inherited)' would
        # make Gem::Version raise and take pod install down with it.
        next unless current.is_a?(String) && current.match?(/\\A\\d+(\\.\\d+)*\\z/)
        if Gem::Version.new(current) < Gem::Version.new(app_min_ios)
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
