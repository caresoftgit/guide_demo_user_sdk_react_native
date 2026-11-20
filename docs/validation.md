# Kiểm chứng bộ bàn giao 0.1.3

Ngày kiểm tra: 2026-11-20. React Native 0.88.1 / React 19.3.0; Node 24, JDK 17, Xcode 26.4 / Swift 6.3. SDK dùng native Android core/UI 0.4.2 và iOS 0.1.2.

## Phạm vi bản phát hành

Bản 0.1.3 cập nhật đóng gói, làm sạch metadata và hoàn thiện hướng dẫn. API và nghiệp vụ cuộc gọi giữ nguyên. Repo demo chỉ kèm gói SDK hiện hành; không kèm các bản cũ, cấu hình server/tài khoản/push nội bộ hoặc thông tin ký ứng dụng.

## Kết quả tự động

| Kiểm tra | Kết quả |
|---|---|
| API TypeScript SDK | 8/8 test qua; typecheck qua |
| Demo dùng gói 0.1.3 | 10/10 test qua; typecheck qua |
| ESLint | 0 lỗi; 6 cảnh báo style có sẵn |
| Framework iOS | Release build qua cho device và simulator; các symbol API xuất ra khớp bản trước |
| Artifact Android | Maven artifact khớp checksum bản đã kiểm chứng trước; không thay binary Android |
| Package | 330 checksum native hợp lệ; đủ device/simulator, resources, privacy manifest, license và framework version/build |
| Consumer iOS | Release build simulator arm64 qua từ gói 0.1.3, không ký phân phối |
| Cài package | npm cài được gói local, lockfile trỏ đúng 0.1.3; CocoaPods cài thành công |
| Rà soát dữ liệu | Quét source và package, gồm AAR/JAR lồng nhau; không phát hiện giá trị test nội bộ đã biết, đường dẫn cá nhân hoặc private key |
| Tài liệu | Liên kết file nội bộ hợp lệ; bản mô tả API trong hai repo khớp nhau |

Test React còn cảnh báo `SafeAreaView` deprecated của React Native. Các cảnh báo hiện tại không làm fail typecheck/test. Không coi kiểm thử unit hoặc build thành công là bằng chứng cuộc gọi thực tế thành công.

## Nghiệm thu khi tích hợp

Bộ công khai dùng cấu hình trống. Đơn vị tích hợp phải cấp gateway, App ID, đầu số, push và signing riêng, rồi thực hiện [checklist thiết bị](testing.md). Bản đóng gói 0.1.3 chưa được nghiệm thu lại cuộc gọi thật, APNs/FCM, khóa màn hình, audio hai chiều hoặc Wi-Fi/di động trên hệ thống của khách hàng.

Build Android release trước đó đã kiểm chứng R8 với cùng native Android core/UI. Framework iOS giữ cùng API/runtime; thay đổi lần này làm sạch thông tin máy build. Gói npm này không được tự publish lên registry và không tự upload ứng dụng lên TestFlight.
