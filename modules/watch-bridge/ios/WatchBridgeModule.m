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

- (void)session:(WCSession *)session didReceiveFile:(WCSessionFile *)file {
  NSString *sessionId = file.metadata[@"id"];
  NSString *fileType  = file.metadata[@"file"];  // "session" or "track"
  if (!sessionId || !fileType) return;

  // Mirror the path that expo-file-system's storage.load() expects:
  // {documentDirectory}/sessions/{id}/{file}.json
  NSURL *docsDir = [NSFileManager.defaultManager
      URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
  NSURL *dir = [docsDir URLByAppendingPathComponent:
      [NSString stringWithFormat:@"sessions/%@", sessionId]];
  NSError *err = nil;
  [NSFileManager.defaultManager createDirectoryAtURL:dir
                          withIntermediateDirectories:YES attributes:nil error:&err];

  NSURL *dest = [dir URLByAppendingPathComponent:
      [fileType stringByAppendingString:@".json"]];
  [NSFileManager.defaultManager removeItemAtURL:dest error:nil];  // idempotent
  [NSFileManager.defaultManager copyItemAtURL:file.fileURL toURL:dest error:&err];

  // Emit only once — when session.json arrives; track.json follows but needs no event.
  if (!err && [fileType isEqualToString:@"session"]) {
    [self sendEventWithName:@"sessionReceived" body:@{@"id": sessionId}];
  }
}

@end
