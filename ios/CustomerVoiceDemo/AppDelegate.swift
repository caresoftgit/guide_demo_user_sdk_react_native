import UIKit
import CustomerVoiceReactNative

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
 func application(_ application: UIApplication,didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey:Any]?=nil)->Bool {
  if let url=Bundle.main.url(forResource:"voice_config",withExtension:"json"),let data=try? Data(contentsOf:url),let c=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let backend=c["backendUrl"] as? String,let backendURL=URL(string:backend),let account=c["accountId"] as? String,!account.isEmpty,let app=c["appId"] as? String,!app.isEmpty {
   do {try VoiceBootstrap.initialize(backendURL:backendURL,accountID:account,appID:app,supportName:c["supportName"] as? String ?? "Chăm sóc khách hàng",environment:c["pushEnvironment"] as? String == "sandbox" ? .sandbox:.production)} catch {/* Public UI reports configuration unavailable; never log config or credentials. */}
  }
  return true
 }
 func application(_ application: UIApplication,didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {VoiceBootstrap.didRegisterForRemoteNotifications(deviceToken:deviceToken)}
 func application(_ application: UIApplication,didReceiveRemoteNotification payload:[AnyHashable:Any],fetchCompletionHandler done:@escaping(UIBackgroundFetchResult)->Void) {Task {@MainActor in done(await VoiceBootstrap.handleRemoteNotification(payload) ? .newData:.noData)}}
}
