# Chạy demo React Native

## 1. Cài đặt

Cài Node 22.13+, Android toolchain phù hợp RN 0.88.1 (demo ghim compileSdk/build-tools 37, NDK 28.1), JDK 17+; iOS cần macOS, Xcode và CocoaPods. Yêu cầu iOS 15.1+, Android API 26+.

```sh
shasum -a 256 -c packages/SHA256SUMS
npm ci --legacy-peer-deps
cp config/voice.example.json config/voice.local.json
```

Điền gateway URL, `bootstrapUrl` HTTPS của backend doanh nghiệp, Account/App ID, đầu số hỗ trợ và pushEnvironment. Android Firebase dùng `appId`, `apiKey`, `projectId`, `senderId` của **client mobile**, không phải service-account/private key. Các trường cấu hình này công khai. Không thêm user_id, bearer hoặc token tích hợp; generator từ chối field ngoài danh sách.

```sh
npm run configure
```

Generator ghi cùng config vào JS, Android assets và iOS resource. Chạy lại khi đổi config rồi build native lại. Không commit file local/generated. Giữ sample Bundle ID/package hoặc đổi sang định danh cuối của doanh nghiệp và đăng ký đúng trên Caresoft/Firebase/APNs.

## 2. Nối HTTP client ứng dụng

Demo không có màn hình hoặc API đăng nhập doanh nghiệp. Sau khi ứng dụng đã đăng nhập, tạo callback bằng `createHostBackend(config.bootstrapUrl, authenticatedApplicationTransport)` trong `src/hostBackend.ts` và render `<App requestTicket={requestTicket}/>` từ entry/root của ứng dụng. Ví dụ đầy đủ, kiểu transport và payload nằm trong [host-bootstrap.md](host-bootstrap.md).

Adapter phải tự gắn phiên doanh nghiệp đang có, tắt redirect ở native, giới hạn response trước khi buffer và hỗ trợ hủy request. Không dùng bare RN fetch như cơ chế chống redirect. Khi chưa inject callback, app vẫn mở Home nhưng không cho Kết nối Voice. Không nhập API token hoặc user_id vào demo.

## 3. Android

Project mẫu đã có Application bootstrap, FCM forwarding, quyền và native resources. Cấu hình `android/local.properties` với Android SDK của máy, kiểm tra Firebase đúng package và cấp POST_NOTIFICATIONS/full-screen theo OS.

```sh
npm run android
# Hoặc APK Release có JS bundle, không cần Metro:
cd android
./gradlew :app:assembleRelease
```

Release mẫu dùng debug signing để chạy thử; dùng keystore/signing của doanh nghiệp khi phân phối. Không coi cấu hình mẫu là cấu hình production.

## 4. iOS

```sh
cd ios
pod install --no-repo-update
open CustomerVoiceDemo.xcworkspace
```

Chọn simulator để kiểm tra UI/gọi ra. Khi chạy iPhone, đặt Bundle ID, Development Team và provisioning của doanh nghiệp; bật Push Notifications, Background Audio/VoIP/Remote notifications. APNs environment phải khớp profile: TestFlight dùng production. APNs key chỉ nhập phía server Caresoft, không đặt trong app. Bản source không chứa tài khoản upload hay signing team cụ thể.

## 5. Kiểm tra luồng

Ứng dụng đăng nhập doanh nghiệp → Kết nối Voice → prepare PKCE → bootstrap đã xác thực → ticket exchange native → readiness → Gọi CSKH. Chỉ bật gọi khi `canCall`; nhận cuộc gọi còn phụ thuộc push/quyền thực tế. Ngắt Voice chỉ ngắt phiên Voice. Đăng xuất toàn ứng dụng phải tích hợp host logout/outbox theo [hợp đồng](host-bootstrap.md).

Không tự gọi lại khi mất response hoặc reconnect. Demo đồng bộ call trước khi cho tạo call mới và có nút Quay lại cuộc gọi. Nghiệm thu hai chiều, background/lock/cold start trên thiết bị thật theo [checklist](testing.md).
