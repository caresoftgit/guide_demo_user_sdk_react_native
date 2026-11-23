# Tích hợp Customer Voice vào React Native

## 1. Chuẩn bị

Bản SDK 0.5.0 kiểm chứng trên React Native 0.88.1/React 19.3, New Architecture qua native-module interop. Android API 26+; iOS 15.1+ và Xcode 26.4/Swift 6.3; Node 22.13+ (khuyến nghị Node 24), JDK 17. Cần native build, không dùng Expo Go.

Nhận gateway HTTPS URL (không thêm `/api/v1/voice`), Account ID và đầu số CSKH đã định tuyến từ Caresoft. Tạo Caresoft App ID bên dưới. Doanh nghiệp giữ đăng nhập/SSO hiện có, backend ánh xạ principal sang user_id Caresoft. Chỉ backend giữ credential issue/revoke/read; app xin ticket bằng HTTP client đã xác thực. Xem [hợp đồng bootstrap đầy đủ](host-bootstrap.md). Không có backend đăng nhập doanh nghiệp đi kèm demo.

## 2. Tạo App trên Caresoft và push

1. Đăng nhập trang quản trị đúng môi trường, vào **Admin Settings → Cơ bản → Voice SDK**. Nhờ quản trị viên cấp quyền nếu chưa thấy mục này.
2. Tạo App, đặt tên, bật Hoạt động, lưu và sao chép **App ID**. App ID Caresoft không phải Bundle ID/package của mobile.
3. Android: trong cấu hình push của App, thêm Android/FCM với package cuối cùng đúng Firebase client. Firebase Console → Project settings → Service accounts → Generate new private key; đưa service-account JSON đầy đủ vào cấu hình **server Caresoft**. Không đưa private JSON vào app.
4. iOS: thêm iOS/APNs VoIP cho đúng Bundle ID, Apple Team ID, Key ID và APNs environment. Nhập đầy đủ PEM của `.p8` vào cấu hình **server Caresoft**. VoIP topic `<bundle-id>.voip`; thông báo thường `<bundle-id>`.
5. Bật các cấu hình push. Có thể dùng chung Caresoft App ID cho Android/iOS, nhưng mỗi OS/package/environment có cấu hình riêng. App mobile không gửi `push_config_id` và không nhận private key server.
6. APNs environment phải khớp profile/signing: production cho TestFlight/distribution; development/sandbox cho bản development có cấu hình tương ứng. Bundle ID mới cần cấu hình tương ứng, không tự dùng cấu hình của app khác.

Xem [chạy demo từng bước](demo.md) để cấu hình project mẫu Android/iOS.

## 3. Cài package

Chép file SDK từ `packages/` vào dự án React Native:

```sh
npm install ./packages/caresoft-customer-voice-react-native-0.5.0.tgz
```

Package đã kèm bridge và artifact native; không thêm LiveKit, react-native-webrtc hoặc CallKeep khác cho tính năng này. SDK native tự quản lý media/CallKit/Telecom.

Android: thêm Maven tree của package và JitPack vào `android/build.gradle` (hoặc repositories trong settings nếu host quản lý repositories tập trung):

```groovy
allprojects {
    repositories {
        maven { url new File(rootDir, '../node_modules/@caresoft/customer-voice-react-native/android/maven') }
        maven { url 'https://jitpack.io' }
    }
}
```

Giữ Google/Maven Central của host. Android minSdk26, JDK 17; demo đã ghim compileSdk 37/build-tools 37/NDK 28.1 và cấu hình Gradle theo template RN 0.88.1. Chạy `cd ios && pod install` trên iOS. Mở `.xcworkspace`, không mở riêng `.xcodeproj`. Không phát hành native artifacts của SDK khác phiên bản ghi trong manifest.

## 4. Bootstrap Android trước JavaScript

Trong Application.onCreate, gọi trên main thread:

```kotlin
import vn.caresoft.customervoice.reactnative.VoiceBootstrap
VoiceBootstrap.initialize(this, gatewayUrl, accountId, caresoftAppId, "Chăm sóc khách hàng")
```

Các giá trị trên là config không chứa token account. Tại FirebaseMessagingService **đang có của host**, thêm forwarding (import `com.google.firebase.messaging.RemoteMessage` và `vn.caresoft.customervoice.reactnative.VoiceBootstrap`):

```kotlin
override fun onMessageReceived(message: RemoteMessage) {
    if (!VoiceBootstrap.handleRemoteMessage(message.data)) {
        // Xử lý message khác của ứng dụng.
    }
}
override fun onNewToken(token: String) {
    VoiceBootstrap.onNewPushToken(token)
}
```

Không tạo service FCM thứ hai tranh cùng message. Forward nguyên data, không mở màn hình/answer từ push. Khi khởi động Firebase, lấy token hiện tại và gọi `VoiceBootstrap.onNewPushToken(token)`; bootstrap đăng ký theo session sau login/restore và retry sau resume/reconnect, token rotation đang có request sẽ được xử lý tiếp. Không cần chờ JS.

Nếu host đã dùng Firebase, giữ cấu hình hiện có. Nếu chưa có, cấu hình Firebase đúng package bằng Google Services plugin hoặc FirebaseOptions như demo. Không đưa service-account/private JSON vào mobile. Manifest/service/permissions và ví dụ đầy đủ nằm trong `android/app/`.

## 5. Bootstrap iOS trước JavaScript

Trong AppDelegate.didFinishLaunchingWithOptions:

```swift
import CustomerVoiceReactNative
try VoiceBootstrap.initialize(
    backendURL: URL(string: gatewayUrl)!, accountID: accountId, appID: caresoftAppId,
    supportName: "Chăm sóc khách hàng", environment: .production
)
```

SDK sở hữu PushKit registry theo mặc định. Nếu app đã có registry, dùng `managesPushKit:false` và forward token/payload/completion vào `CustomerVoice.shared.updatePushToken`/`handleVoIPPush` của core (import CustomerVoice); không tạo registry thứ hai và không đi qua JS trước khi report CallKit. Completion VoIP phải được hoàn tất đúng một lần.

Forward APNs thường trong AppDelegate:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
    VoiceBootstrap.didRegisterForRemoteNotifications(deviceToken: token)
}
func application(_ application: UIApplication, didReceiveRemoteNotification payload: [AnyHashable:Any],
                 fetchCompletionHandler done: @escaping (UIBackgroundFetchResult)->Void) {
    Task { @MainActor in
        let handled = await VoiceBootstrap.handleRemoteNotification(payload)
        done(handled ? .newData : .noData)
        // Host có notification khác cần dispatch và điều phối completion một lần.
    }
}
```

Khi root UIViewController sẵn sàng, gọi `VoiceBootstrap.attach(to: rootController)`. Khi app/scene active, gọi `VoiceBootstrap.resume()`. Demo dùng SceneDelegate; dự án AppDelegate không dùng scenes thực hiện cùng bước khi window/root đã sẵn sàng.

Bật Push Notifications và Background Modes: Audio, Voice over IP, Remote notifications. Thêm `NSMicrophoneUsageDescription`. Giữ `NSCameraUsageDescription` theo ví dụ demo do thư viện media tham chiếu camera, dù demo chỉ gọi thoại; không tự xin quyền camera. Cấu hình entitlements/signing/APNs environment cho đúng app. Không thêm Apple Team/private key vào source public.

## 6. Khởi tạo API và quan sát state

```ts
import {CustomerVoice} from '@caresoft/customer-voice-react-native';
const off = CustomerVoice.subscribeState(state => {
  // sessionState, readiness, calls, audioStates, connectionStates.
});
await CustomerVoice.initialize({backendUrl: gatewayUrl, accountId, appId: caresoftAppId,
  supportName: 'Chăm sóc khách hàng', pushEnvironment: 'production'});
```

`initialize` xác nhận cấu hình khớp native bootstrap, không thay bootstrap sớm bằng JS. Đổi account/App ID khi có phiên phải logout theo API native trước và cập nhật cấu hình ứng dụng. Config fixed trong demo cần build lại khi đổi.

Subscribe nhận snapshot hiện tại và thay đổi mới; snapshot cũ đến muộn bị bỏ. Reload JS chỉ detach observer, không kết thúc native call. Gọi `off()` khi component bỏ observer; `dispose()` chỉ dọn toàn bộ observer JS, không logout/hangup.

## 7. Login, quyền và readiness

```ts
// requestTicket là callback của ứng dụng, cấu hình qua createHostBackend(...).
const p = await CustomerVoice.prepareLogin();
const ticket = await requestTicket(p);
await CustomerVoice.loginWithTicket(p.attemptId, ticket);
await CustomerVoice.requestMicrophonePermission(); // từ thao tác người dùng
const ready = await CustomerVoice.checkReadiness();
// ready.isLoggedIn, ready.canCall, ready.canReceive, ready.reasons
```

Inject `<App requestTicket={requestTicket}/>` với HTTP client ứng dụng hiện có; [ví dụ và yêu cầu transport](host-bootstrap.md). Mặc định demo chưa kết nối client và không thu thông tin đăng nhập. Backend nhận đúng bảy trường preparation snake_case, tự thêm user_id/Account/App/host session từ dữ liệu server. Không chấp nhận định danh khách hàng do client truyền.

Native giữ verifier/access/refresh, tự refresh single-flight và restore. `SessionInfo` public gồm userId, sessionId, expiresAt, sessionExpiresAt và authProtocol=2. Ticket chỉ ở memory trong bootstrap. Exchange mất response cần attempt/ticket mới; HTTP 401 đưa về luồng đăng nhập sẵn có của ứng dụng, không mở form trong SDK. TTL, mã hóa và revoke xem hợp đồng bootstrap.

Android 13+ xin POST_NOTIFICATIONS từ host (demo dùng PermissionsAndroid). Android 14+ kiểm tra `canShowIncomingScreen()`, mở `requestIncomingScreenPermission()` từ thao tác người dùng. Native không bypass PIN và không bảo đảm nhận push sau Force stop. iOS CallKit không dùng quyền full-screen Android.

`isLoggedIn` phản ánh phiên đã được kiểm chứng gần đây, không chỉ token đang lưu. `UNKNOWN` khi không xác minh được không đồng nghĩa logout; không login lặp khi offline. `canReceive` còn cần push/quyền thích hợp, không bảo đảm push thực tế đã tới thiết bị.

## 8. Gọi và nhận cuộc gọi

```ts
if ((await CustomerVoice.checkReadiness()).canCall) {
    await CustomerVoice.call(assignedBusinessNumber);
}
```

Đầu số do host giữ sau khi được cấp, là chuỗi 1–32 chữ số có thể có `+` đầu; không có getDestinations. Không gửi SIP/IP/prefix nội bộ từ mobile. Chặn bấm Gọi lặp. Khi request tạo call timeout/mất response, khóa nút Gọi và `await CustomerVoice.synchronize()` trước khi cho phép tạo mới; nếu đồng bộ thất bại thì tiếp tục khóa và cho người dùng thử đồng bộ, không tạo call lại. Khi attach/reload, cũng chờ đồng bộ trước khi cho gọi; SDK không tự replay mutation.

UI native tự hiển thị call khi foreground và nhận qua CallKit/notification ở nền. Có trả lời/từ chối/kết thúc, micro, audio route thực tế và DTMF. Không tự answer từ component bind. Kết thúc local/remote đóng call UI về Home kể cả HTTP hangup chưa xong. `showCall(callId)` dùng để trở lại call còn presentable, không tạo call.

`connectionStates` phản ánh media CONNECTING/CONNECTED/RECONNECTING; `calls[].state` do gateway quyết định, chỉ ACTIVE xác nhận đàm thoại theo contract hiện có. Khi đổi mạng, UI hiện Đang kết nối lại, giữ call và mute. Sau 30 giây liên tục không phục hồi, native dừng media/Telecom/CallKit, đóng UI và phát NETWORK_RECOVERY_TIMEOUT. Không gọi lại `call()` khi thấy reconnect. Chỉ mất control socket không dừng media còn tốt.

## 9. Foreground và logout

Khi AppState trở lại active, gọi `CustomerVoice.resume()`; không tự login lại. Đọc state để phục hồi Home sau reload.

Nút **Ngắt Voice** chỉ gọi `await CustomerVoice.logout()`: dừng call, dọn local rồi cố revoke phiên Voice, tài khoản doanh nghiệp vẫn đăng nhập. Nếu lỗi `LOGOUT_REVOKE_UNCONFIRMED`, local vẫn đã logout, không restore credential cũ.

Đăng xuất **ứng dụng** phải thực hiện cả SDK logout và logout doanh nghiệp, kể cả một bên lỗi. Dùng coordinator tuần tự hóa với kết nối/chuyển tài khoản để callback không dùng nhầm phiên. Backend vô hiệu hóa phiên và ghi durable HOST-revoke outbox trong cùng transaction, retry cùng UUID/payload rồi poll cleanup; xem [payload logout](host-bootstrap.md). Khi offline/chưa nhận được yêu cầu, phải báo chưa xác nhận thu hồi; không coi local logout là server đã thu hồi.

## 10. Build và nghiệm thu

```sh
npm test
npm run typecheck
cd android && ./gradlew :app:assembleRelease
# iOS: build workspace bằng Xcode, chọn signing của app bạn khi cài iPhone.
```

Xem [checklist nghiệm thu](testing.md). Simulator/emulator có ích cho UI/bridge; APNs/FCM, lockscreen, audio và Wi-Fi/5G phải thử trên thiết bị thật với cấu hình riêng. TestFlight/store/registry không tự được upload khi build local.

### Quay lại cuộc gọi đang diễn ra

Khi Home hiển thị, lấy call còn `presentable` từ snapshot và cho người dùng mở lại bằng `CustomerVoice.showCall(callId)`. Demo đã có nút **Quay lại cuộc gọi**. Không dùng `call()` hoặc `answer()` để mở lại màn hình. Call đã kết thúc hoặc dừng local không còn presentable.
