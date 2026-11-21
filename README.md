# Customer Voice — demo và tích hợp React Native

Bộ SDK/demo **0.5.0** dành cho ứng dụng khách hàng. Demo dùng React Native 0.88.1/React 19.3, chạy Android và iOS, có đăng nhập/đăng xuất, readiness, nút Gọi CSKH và màn hình cuộc gọi native có sẵn.

1. Đọc [hướng dẫn tích hợp](docs/integration.md), tạo App và cấu hình push trên Caresoft.
2. Cài Node 22.13+ (đã dùng Node 24), JDK 17, Android toolchain hoặc Xcode 26.4/CocoaPods.
3. Clone repo này rồi chạy `npm ci` ở thư mục gốc repo. Script configure tạo file cấu hình mặc định, không có tài khoản/server dùng sẵn.
4. Chép `config/voice.example.json` thành `config/voice.local.json`, điền cấu hình của app bạn. Chỉ đưa cấu hình public vào file, gồm enterpriseBackendUrl HTTPS của host simulator.
5. Chạy `npm run configure`, sau đó làm bước build Android/iOS trong [hướng dẫn chạy demo](docs/demo.md).
6. Khởi động [host simulator](host/README.md), cấp quyền, nhập username/password fixture trong form demo và kiểm tra [các luồng nghiệm thu](docs/testing.md).

`packages/` chứa đúng SDK `.tgz` mà demo sử dụng; không cần clone source native hoặc tự build SDK để chạy demo. Có Internet để tải dependencies upstream. Không dùng Expo Go.

Android demo compileSdk 37, build-tools 37, NDK 28.1.13356709; minSdk 26. Ghi `sdk.dir` vào `android/local.properties` hoặc đặt ANDROID_HOME. Cấu hình này không được đưa vào Git. Release demo dùng debug key để thử local, không dùng chữ ký demo để phát hành ứng dụng production. iOS simulator dùng chữ ký ad-hoc và entitlement Keychain, không cần Apple certificate; iPhone nhận APNs cần Bundle ID/profile/environment đúng.

Form đăng nhập dùng username/password fixture của host mô phỏng. Host ánh xạ principal sang user_id đã cấu hình. Integration credential và user mapping nằm riêng trên server. Mật khẩu được xóa khỏi form khi đóng. Enterprise bearer chỉ giữ trong memory của JavaScript.

- [API](docs/api.md)
- [Tích hợp từng bước](docs/integration.md)
- [Kiểm thử thiết bị](docs/testing.md)
- [Chạy demo Android/iOS](docs/demo.md)
- [Kết quả kiểm chứng và giới hạn](docs/validation.md)
- [Source SDK](https://github.com/caresoftgit/user_voice_sdk_react_native)
