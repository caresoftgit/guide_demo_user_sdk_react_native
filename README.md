# Customer Voice demo — React Native

Bộ tích hợp React Native **0.5.0** cho Android/iOS, dùng native core/UI và phiên Voice protocol 2. Ứng dụng đăng nhập doanh nghiệp theo hệ thống đang có; backend tự lấy `user_id` Caresoft và cấp ticket PKCE. Demo nhận callback xin ticket qua HTTP client đã xác thực, không thu username/password/API token và không kèm backend đăng nhập doanh nghiệp.

- [Chạy demo](docs/demo.md): cài gói, cấu hình công khai, Android/iOS và inject callback.
- [Tích hợp vào ứng dụng](docs/integration.md): native bootstrap, push, login/logout, gọi/nhận.
- [Payload và quản lý phiên](docs/host-bootstrap.md): sơ đồ, request/response, bảo mật, TTL/refresh/revoke.
- [Kiểm thử](docs/testing.md) và [tiêu chí nghiệm thu](docs/validation.md).
- [Source SDK](https://github.com/caresoftgit/user_voice_sdk_react_native), [API](https://github.com/caresoftgit/user_voice_sdk_react_native/blob/main/docs/api.md).

```sh
shasum -a 256 -c packages/SHA256SUMS
npm ci --legacy-peer-deps
npm test -- --watch=false
npm run typecheck
```

RN 0.88.1 / React 19.3, Node 22.13+, Android API 26+, iOS 15.1+. Cần native build; không chạy bằng Expo Go. Gói `.tgz` trong `packages/` đã có artifact Android/iOS, resource, license và manifest checksum.

Cấu hình mặc định dùng địa chỉ ví dụ; nút Kết nối Voice bị khóa khi chưa cung cấp `requestTicket`. Cấu hình riêng đặt trong `config/voice.local.json` (bị gitignore); chỉ chứa URL/ID/đầu số và Firebase client config công khai. Không đưa credential server hoặc dữ liệu tài khoản thật vào source.
