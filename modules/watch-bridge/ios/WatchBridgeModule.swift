import Foundation
import WatchConnectivity

@objc(WatchBridgeModule)
class WatchBridgeModule: RCTEventEmitter, WCSessionDelegate {

  private static var shared: WatchBridgeModule?

  override init() {
    super.init()
    WatchBridgeModule.shared = self
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  override func supportedEvents() -> [String]! {
    return ["sessionReceived"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession,
               activationDidCompleteWith activationState: WCSessionActivationState,
               error: Error?) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func session(_ session: WCSession, didReceive file: WCSessionFile) {
    let dest = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".json")
    do {
      try FileManager.default.copyItem(at: file.fileURL, to: dest)
      sendEvent(withName: "sessionReceived", body: ["id": dest.lastPathComponent])
    } catch {
      // Silently drop — the watch will retry on next pairing
    }
  }
}
