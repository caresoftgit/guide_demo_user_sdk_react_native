# Kiểm thử React Native

## Kiểm tra tự động

```sh
npm test -- --watch=false
npm run typecheck
cd android
./gradlew :app:assembleRelease :caresoft_customer-voice-react-native:testDebugUnitTest
```

Jest kiểm tra callback phiên ứng dụng, schema/timeout/error của bootstrap, không có form thông tin đăng nhập, gọi không trùng và trở lại call. Kiểm tra checksum `.tgz` bằng `shasum -a 256 -c packages/SHA256SUMS` trước cài.

Build iOS từ workspace hoặc dòng lệnh:

```sh
xcodebuild -workspace ios/CustomerVoiceDemo.xcworkspace \
  -scheme CustomerVoiceDemo -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/consumer CODE_SIGNING_ALLOWED=NO build
```

## Nghiệm thu với backend doanh nghiệp

- Phiên doanh nghiệp hợp lệ xin được ticket; hết phiên trả 401 và về luồng đăng nhập ứng dụng.
- Không cho client đổi user_id/Account/App/host session; sai package/Bundle ID, ticket hết hạn/dùng lại hoặc PKCE không khớp bị từ chối.
- Request chỉ có bảy field preparation; response không có credential server hoặc access/refresh Voice.
- Transport từ chối redirect 301/302/307/308, hủy khi timeout, giới hạn response; lỗi không lộ nội dung server/bearer.
- Chuyển tài khoản khi bootstrap đang chạy không commit phiên cũ; dùng coordinator để tuần tự hóa logout/login.
- Ngắt Voice dọn local dù revoke lỗi; full logout vô hiệu host và retry/poll durable HOST-revoke sau restart backend.
- Không có ticket, bearer, refresh, push payload hay private key trong log/crash/analytics.

## Nghiệm thu thiết bị thật

Gọi ra/nhận vào, answer/reject/hangup hai phía, audio hai chiều, mute, loa/Bluetooth, DTMF; bấm gọi liên tục và mất response không tạo trùng. Đổi Wi-Fi/mobile, reconnect giữ mute và dừng sau timeout native nếu không phục hồi. Reload JS/mở lại màn hình không tạo call mới.

Android: quyền microphone/notification/full-screen, nền/khóa/cold start, FCM rotation, service/Telecom; Force stop là giới hạn OS. iOS: CallKit/PushKit/APNs production hoặc sandbox đúng signing, foreground/background/khóa/cold start, remote cancel và token rotation. Simulator không nghiệm thu APNs/audio vật lý.

Kiểm tra restore phiên protocol 2, refresh rotation/single-flight, hết cửa sổ retry, hạn tuyệt đối, logout offline và explicit revoke khi call ACTIVE. `canReceive=true` chưa chứng minh push đã tới. Ghi kết quả theo [tiêu chí nghiệm thu](validation.md); test unit/build không thay kết quả gọi và push thật.
