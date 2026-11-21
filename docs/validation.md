# Kiểm chứng bộ bàn giao 0.5.0

Bản 0.5.0 bổ sung ticket+PKCE, native-owned credentials, metadata protocol 2, enterprise fixture login và durable host logout outbox. Kết quả build/test thực tế được ghi trong `docs/secure-session-implementation-report.md` của source SDK.

React Native 0.88.1, React 19.3, Node 24 và JDK 17 là toolchain dùng trong lượt implementation. Native artifacts phải đồng bộ Android core/UI và iOS 0.5.0 theo checksum manifest trong package.

Host tests dùng HTTP fixture trên loopback và state file tạm để kiểm tra principal binding, identity/verifier override, logout persist-before-delivery, same-request retry sau restart và revocation status. Demo dùng preconfigured user_id server-side và tài khoản fixture phát triển được bật rõ ràng.

Nghiệm thu end-to-end còn cần gateway/database/replay key, credential account/app scoped, customer ownership, HTTPS host, push provisioning, signing, routing và thiết bị thật. Thực hiện checklist Android/iOS trong testing.md, gồm locked/background/cold start, audio hai chiều, network recovery, expiry và explicit revoke.

Enterprise bearer của demo ở JS memory. Khi đóng process, host logout đang chờ gửi sẽ mất trong app. Sau khi host nhận logout, outbox trên đĩa tiếp tục retry sau restart. Đơn vị tích hợp nối cơ chế xác thực và logout delivery bền vững của enterprise vào cùng contract.

## Kết quả final package

- SDK 0.5.0 verifier qua 330 native checksums, license/resource/privacy và kiểm tra đường dẫn máy build.
- Demo cài tarball local 0.5.0, 13 Jest tests, TypeScript và 7 host security tests đều qua.
- Android debug/release, 6 bridge native tests và lint qua với 285 Gradle tasks.
- CocoaPods cài 88 pods và iOS Release arm64 simulator build qua với signing tắt.
- Native Android/iOS từ chối restore protocol 1 trong cấu hình secure mặc định.

Các log final nằm tại `/private/tmp/rn-final-android-consumer.log`, `/private/tmp/rn-final-ios-consumer.log` và `/private/tmp/rn-final-demo-js.log` trên máy build. Android APK dùng debug signing của demo. iOS artifact là simulator app. Nghiệm thu gateway thật, media/push và thiết bị vẫn theo checklist testing.md.

## Bổ sung bản sửa native cuối

Gói bàn giao đã thay binary iOS bằng commit c3402ce: sửa natural expiry/cold start và khôi phục Keychain khi app dừng giữa commit. 70 Swift tests, consumer Swift/ObjC device/simulator và 1.415 checksum distribution đều qua. Gói RN được đóng lại, npm ci offline và 330 checksum của package đã cài đều khớp. Demo13tests, host7tests và TypeScript qua; iOS Release arm64 simulator build từ gói đã sửa qua tại /private/tmp/voice-rn-corrected-ios-consumer.log. UUID arm64 framework trong app khớp vendor đã sửa (Xcode strip/thin khi embed). Android inputs không đổi so với build285tasks đã qua; APK release đã cài/mở trên API35emulator, Home chưa cấu hình hiển thị đúng và khóa gọi. Smoke này chưa đăng nhập gateway hoặc gọi thật.

SHA256 gói cuối: 15941f0812c8a88c10e85cae4008669eb9e4ee7534999f324181416cbe4fac47.
