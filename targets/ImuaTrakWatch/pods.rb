# CocoaPods dependencies for the ImuaTrakWatch target.
#
# @bacons/apple-targets' Podfile loader globs targets/**/pods.rb and evaluates
# this inside a `target 'ImuaTrakWatch' do ... end` block, so Firebase is scoped
# to the watch target only — the phone app keeps using the `firebase` JS SDK and
# never links native Firebase.
platform :watchos, '9.0'

pod 'FirebaseAuth'
pod 'FirebaseFirestore'
