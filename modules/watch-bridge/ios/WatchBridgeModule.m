#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#import <WatchConnectivity/WatchConnectivity.h>

@interface WatchBridgeModule : RCTEventEmitter <RCTBridgeModule, WCSessionDelegate>
@end

@implementation WatchBridgeModule

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[@"sessionReceived"];
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    if ([WCSession isSupported]) {
      WCSession.defaultSession.delegate = self;
      [WCSession.defaultSession activateSession];
    }
  }
  return self;
}

- (void)session:(WCSession *)session
    activationDidCompleteWithState:(WCSessionActivationState)activationState
                             error:(nullable NSError *)error {}

- (void)sessionDidBecomeInactive:(WCSession *)session {}

- (void)sessionDidDeactivate:(WCSession *)session {
  [WCSession.defaultSession activateSession];
}

// Send a JSON-serialisable payload (auth custom token, weekly goals, units…)
// to the paired watch. The latest value is stashed in applicationContext so a
// watch that wakes later still receives it; when the watch is reachable we also
// sendMessage for immediacy.
RCT_EXPORT_METHOD(sendContext:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![WCSession isSupported]) {
    resolve(@(NO));
    return;
  }
  WCSession *session = WCSession.defaultSession;
  NSError *ctxError = nil;
  [session updateApplicationContext:payload error:&ctxError];
  if (session.isReachable) {
    [session sendMessage:payload replyHandler:nil errorHandler:nil];
  }
  resolve(ctxError == nil ? @(YES) : @(NO));
}

- (void)session:(WCSession *)session didReceiveFile:(WCSessionFile *)file {
  NSURL *dest = [NSFileManager.defaultManager.temporaryDirectory
      URLByAppendingPathComponent:[[[NSUUID UUID] UUIDString]
                                      stringByAppendingString:@".json"]];
  NSError *err = nil;
  [NSFileManager.defaultManager copyItemAtURL:file.fileURL toURL:dest error:&err];
  if (!err) {
    [self sendEventWithName:@"sessionReceived" body:@{@"id": dest.lastPathComponent}];
  }
}

@end
