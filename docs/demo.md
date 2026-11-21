# Chạy demo Android và iOS

## 1. Lấy source và kiểm tra gói SDK

```sh
git clone https://github.com/caresoftgit/guide_demo_user_sdk_react_native.git
cd guide_demo_user_sdk_react_native
shasum -a 256 -c packages/SHA256SUMS
npm ci
cp config/voice.example.json config/voice.local.json
```

Dùng Node 22.13+ (khuyến nghị Node 24). Gói SDK 0.5.0 đã có trong `packages/`, không cần clone source SDK hoặc tải package từ npm registry.

## 2. Điền cấu hình của ứng dụng

Hoàn thành [tạo App Caresoft và push](integration.md#2-tạo-app-trên-caresoft-và-push), sau đó sửa `config/voice.local.json`:

| Trường | Điền giá trị |
|---|---|
| `backendUrl` | HTTPS URL do Caresoft cung cấp, không thêm `/api/v1/voice` |
| `enterpriseBackendUrl` | HTTPS URL host simulator, có certificate thiết bị tin cậy |
| `accountId` | Account ID do Caresoft cung cấp, dạng chuỗi |
| `appId` | App ID tạo trên Caresoft, khác Firebase App ID và Apple Bundle ID |
| `businessNumber` | Đầu số CSKH đã được cấp và định tuyến, dạng chuỗi |
| `supportName` | Tên hiển thị trên màn hình gọi |
| `pushEnvironment` | `production` cho TestFlight; `sandbox` khi ký development và có cấu hình APNs sandbox tương ứng |
| `firebase.appId` | Firebase Android App ID của package cuối cùng |
| `firebase.apiKey` | Firebase client API key; giới hạn theo app tại Firebase/Google Cloud |
| `firebase.projectId` | Firebase Project ID |
| `firebase.senderId` | Firebase messaging sender ID |

Các trường Firebase chỉ dùng cho Android. Demo khởi tạo bằng FirebaseOptions, không cần chép `google-services.json`. Không thêm account API token hoặc file service-account vào cấu hình. Username/password fixture được kiểm tra tại host simulator. Integration credential và user mapping chỉ nằm trên server.

```sh
npm run configure
```

Lệnh tạo ba file bị Git bỏ qua: `src/voice.config.json`, `android/app/src/main/assets/voice_config.json`, `ios/CustomerVoiceDemo/voice_config.json`. Cấu hình này được đóng vào ứng dụng; sau mỗi lần đổi phải chạy lại configure và build lại native app. Không chỉ reload Metro.

## 3. Chạy Android

1. Cài JDK 17, Android SDK/Build Tools 37, NDK 28.1.13356709 và platform-tools. Demo yêu cầu Android API 26+.
2. Đặt `ANDROID_HOME` hoặc tạo `android/local.properties` với `sdk.dir` trỏ SDK trên máy bạn.
3. Đổi `applicationId` trong `android/app/build.gradle` sang package đã khai báo Firebase/Caresoft. Namespace Kotlin có thể giữ nguyên cho demo; không cần đổi namespace để đổi applicationId.
4. Kết nối máy Android, bật USB debugging và chấp nhận quyền trên điện thoại; hoặc mở emulator.
5. Chạy `npm start` ở một terminal, `npm run android` ở terminal khác.
6. Khi app mở, cấp quyền micro, thông báo và full-screen incoming theo phiên bản Android. Đăng nhập như bước 5 bên dưới.

Build APK để thử không phụ thuộc Metro:

```sh
cd android
./gradlew :app:assembleRelease
```

APK nằm tại `android/app/build/outputs/apk/release/app-release.apk`. Bản release demo ký bằng **debug key công khai** của template, chỉ dùng thử local. Khi phát hành thật, dùng signing riêng của ứng dụng, không dùng key này.

## 4. Chạy iOS

1. Cài Xcode 26.4 và CocoaPods theo Gemfile.
2. Cài Pods:

   ```sh
   bundle install
   cd ios
   bundle exec pod install
   cd ..
   ```

3. Mở `ios/CustomerVoiceDemo.xcworkspace`. Chọn scheme **CustomerVoiceDemo**, simulator rồi Run; hoặc chạy `npm start` và `npm run ios`.
4. Khi cài iPhone: chọn Apple Team của bạn, đổi Bundle Identifier sang Bundle ID đã cấu hình trên Caresoft; bật Push Notifications và Background Modes Audio/VoIP/Remote notifications. Dự án đã có Info.plist, purpose strings và entitlements mẫu; kiểm tra lại theo chức năng của ứng dụng.
5. Với development/sandbox: đặt `pushEnvironment` thành `sandbox`, chạy configure, đặt Xcode build setting `VOICE_APNS_ENVIRONMENT=development` và ký development. Với TestFlight: dùng `production` trong cả hai cấu hình và profile distribution. Không đổi Bundle ID mà giữ cấu hình push của app khác.
6. Trước khi phân phối, bổ sung AppIcon riêng trong `Images.xcassets/AppIcon.appiconset`; repo không kèm logo hay thông tin ký của môi trường test nội bộ.

Simulator dùng thử UI/bridge và gọi ra khi gateway sẵn sàng. Nghiệm thu nhận cuộc gọi APNs, CallKit, khóa màn hình và audio/chuyển mạng phải thực hiện trên iPhone thật.

## 5. Đăng nhập và gọi thử

1. Khởi động [host simulator](../host/README.md). Trên Home bấm **Đăng nhập**, nhập username/password fixture do bạn cấu hình. Host tự lấy user_id server-side, issue ticket, rồi native exchange bằng verifier riêng.
2. Kiểm tra trạng thái đăng nhập và các điều kiện readiness. `canCall` và `canReceive` là hai điều kiện riêng; xem lý do nếu chưa sẵn sàng.
3. Bấm **Gọi CSKH**. Demo gọi `businessNumber` đã cấu hình, không có màn hình quay số hoặc trạng thái agent.
4. Thử mic, loa, DTMF; về Home rồi bấm **Quay lại cuộc gọi** để mở lại cùng cuộc gọi.
5. Khi bên nào kết thúc, màn hình gọi phải đóng về Home. Bấm **Đăng xuất**, rồi **Đăng nhập** để thử phiên khác.
6. Thực hiện tiếp [checklist nghiệm thu](testing.md) trên Android/iPhone thật.

## Khi chưa chạy được

| Triệu chứng | Kiểm tra |
|---|---|
| Home báo chưa cấu hình | Điền file local, configure, build lại; không sửa file example để chứa thông tin riêng |
| Native module không liên kết | Cài Pods/autolinking rồi build native; reload Metro chưa đủ |
| Android không có FCM token | Package, FirebaseOptions, Google Play services và kết nối mạng |
| iOS không nhận push | Bundle ID, environment, signing, quyền push và cấu hình Caresoft cùng môi trường |
| Có phiên nhưng không gọi được | Readiness, micro, gateway và đầu số đã được Caresoft định tuyến |
| Request gọi timeout | Chờ `synchronize()` thành công trước khi cho tạo call mới; không retry `call()` tự động |

Không đưa file cấu hình local, token, log chứa credential, keystore production hoặc provisioning profile vào Git.
