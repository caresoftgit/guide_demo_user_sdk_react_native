# Phiên doanh nghiệp và ticket PKCE trên React Native

Áp dụng SDK **0.5.0** và gateway `auth_protocol=2`. Khách hàng đăng nhập ứng dụng doanh nghiệp theo cơ chế đang có. Backend doanh nghiệp đã tra cứu/tạo khách hàng qua Customer REST và ánh xạ principal đã xác thực sang `user_id` Caresoft. App không cho người dùng nhập ID này.

## Cấu hình và trách nhiệm

| Nơi sử dụng | Thông tin cần có |
|---|---|
| App React Native | HTTPS gateway, Account ID, Caresoft App ID, Bundle ID/package, môi trường push và đầu số được cấp |
| HTTP client ứng dụng | Endpoint bootstrap của doanh nghiệp và phiên ứng dụng hiện có |
| Backend doanh nghiệp | Credential tích hợp có scope issue/revoke/read, Account/App và ánh xạ khách hàng |
| Tra cứu khách hàng | Customer REST credential riêng, chỉ ở backend nếu cần |
| Firebase/Caresoft | Package Android, Firebase client config cho app; service-account private key chỉ ở server |
| Apple/Caresoft | Bundle ID, Team/Key ID, APNs key phía server và môi trường khớp provisioning |

Account/App/Bundle ID/đầu số là cấu hình công khai, không phải secret. Credential tích hợp, Customer REST token, APNs private key và Firebase service-account private key chỉ ở server. Firebase client apiKey không phải private key server. App không nhận account API token. Caresoft App ID khác Apple Bundle ID. Không đưa token vào URL, log, analytics hoặc báo cáo crash.

## Luồng hoàn chỉnh

```mermaid
sequenceDiagram
    participant User as Khach hang
    participant App as App doanh nghiep
    participant Host as Backend doanh nghiep
    participant SDK as Native Voice SDK
    participant Gateway as Caresoft Gateway
    User->>App: Dang nhap ung dung
    App->>Host: Xac thuc theo co che san co
    Host-->>App: Phien ung dung hop le
    App->>SDK: prepareLogin()
    SDK-->>App: Preparation cong khai
    App->>Host: Bootstrap qua HTTP client da xac thuc
    Host->>Host: Lay user_id tu principal server
    Host->>Gateway: Issue ticket bang credential server
    Gateway-->>Host: Ticket mot lan
    Host-->>App: Ticket va attempt_id
    App->>SDK: loginWithTicket()
    SDK->>Gateway: Ticket va verifier PKCE
    Gateway-->>SDK: Phien Voice protocol 2
    SDK->>Gateway: Readiness va dong bo cuoc goi
```

### 1. Phiên đăng nhập ứng dụng

Giữ nguyên đăng nhập/SSO, refresh và logout doanh nghiệp hiện có. SDK không xác thực username/password doanh nghiệp, không cấp phiên doanh nghiệp và không quy định API login riêng.

Native thường dùng bearer của ứng dụng qua HTTP client đã xác thực. Đây là **bearer doanh nghiệp**, khác access token Voice và credential Caresoft. Nếu dùng cookie, dùng cookie/session client hiện có; backend phải bảo vệ CSRF theo cơ chế cookie của ứng dụng, nhất là endpoint dùng chung với Web. Native không có CORS bảo vệ như browser; server luôn phải xác thực phiên và kiểm tra quyền.

### 2. App chuẩn bị và xin ticket

Helper `src/hostBackend.ts` thuộc demo, không phải API SDK. Ứng dụng inject callback vào `<App requestTicket={requestTicket} />` sau khi đã xác thực phiên doanh nghiệp:

```tsx
import App from './App';
import {createHostBackend, type HostTransport} from './src/hostBackend';

// Adapter của HTTP client đang có trong ứng dụng, tự gắn bearer/cookie phiên app.
// Phải tắt redirect ở tầng native, giới hạn response 16 KiB trước khi buffer,
// hỗ trợ AbortSignal và trả {status, url, text: async () => string}.
const transport: HostTransport = authenticatedApplicationTransport;
const requestTicket = createHostBackend(
  'https://app.example.com/api/voice/bootstrap', transport,
);
export function SignedInVoiceScreen() {
  return <App requestTicket={requestTicket} />;
}
```

`authenticatedApplicationTransport` là adapter doanh nghiệp cung cấp, không phải hàm có sẵn trong SDK/demo. Nó phải giữ nguyên URL HTTPS, POST/body, không follow redirect (kể cả 307/308) và không log request/response. Native `fetch` của React Native có thể bỏ qua `redirect: 'error'`; không truyền thẳng bare `fetch` và coi đó là bảo đảm chống redirect. Helper kiểm tra URL cuối chỉ là kiểm tra bổ sung sau request. Hạn chế response ở native trước khi buffer; helper kiểm tra lại tối đa 16 KiB và đặt deadline 5 giây.

Bearer gắn ở transport là phiên ứng dụng, không phải token Caresoft. Với cookie dùng client hiện có và CSRF theo chính sách doanh nghiệp. Helper không tạo Authorization, không lưu phiên app và không tự đăng nhập/refresh doanh nghiệp. Mặc định `index.js` chạy `<App />` chưa inject callback nên nút Kết nối Voice bị khóa; đây là chỗ tích hợp HTTP client của khách hàng.

Luồng trực tiếp khi không dùng màn hình mẫu:

```ts
const p = await CustomerVoice.prepareLogin();
const ticket = await requestTicket(p);
await CustomerVoice.loginWithTicket(p.attemptId, ticket);
```

Ví dụ endpoint **do doanh nghiệp triển khai**:

```http
POST https://app.example.com/api/voice/bootstrap
Authorization: Bearer APPLICATION_SESSION_BEARER
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "attempt_id": "ATTEMPT_UUID",
  "installation_id": "INSTALLATION_UUID",
  "os": "ios",
  "application_id": "com.example.CustomerApp",
  "push_environment": "production",
  "code_challenge": "BASE64URL_SHA256_VERIFIER",
  "code_challenge_method": "S256"
}
```

Các giá trị viết hoa là placeholder. `application_id` lấy từ preparation native: Bundle ID iOS hoặc package Android của app cuối cùng. Không tự sửa preparation. Android dùng `os: "android"`, `push_environment: "default"`; iOS dùng `os: "ios"` và `sandbox`/`production` khớp signing/APNs. Account/App và package/Bundle ID phải được đăng ký trên gateway.

Backend xác thực phiên, giới hạn tần suất, lấy `user_id` từ principal server. Account/App, Bundle ID, quyền truy cập khách hàng và host session phải được kiểm tra bằng dữ liệu server; không chấp nhận client override user/account/host session. Chưa ánh xạ khách hàng hoặc phiên hết hạn thì không cấp ticket.

### 3. Backend doanh nghiệp gọi gateway

```http
POST https://GATEWAY_HOST/ACCOUNT_ID/api/v1/voice/session-tickets
Authorization: Bearer SERVER_INTEGRATION_CREDENTIAL
Content-Type: application/json
```

```json
{
  "app_id": "CARESOFT_APP_ID",
  "user_id": "CARESOFT_USER_ID_FROM_SERVER",
  "host_session_ref": "SERVER_HOST_SESSION_UUID",
  "host_session_expires_at": "HOST_SESSION_EXPIRY_ISO8601",
  "attempt_id": "ATTEMPT_UUID",
  "installation_id": "INSTALLATION_UUID",
  "os": "ios",
  "application_id": "com.example.CustomerApp",
  "push_environment": "production",
  "code_challenge": "BASE64URL_SHA256_VERIFIER",
  "code_challenge_method": "S256"
}
```

ID dạng số truyền bằng chuỗi. `host_session_ref` do server quản lý, gắn đúng phiên doanh nghiệp. Gateway kiểm tra credential theo Account/App/scope, quyền truy cập khách hàng, trạng thái App, cấu hình nền tảng và chính sách phiên. Không forward browser Origin vào endpoint server-to-server này.

Response gateway bọc trong `data`; backend lấy các trường cần thiết và trả app response phẳng với `Cache-Control: no-store`:

```json
{
  "attempt_id": "ATTEMPT_UUID",
  "login_ticket": "OPAQUE_ONE_USE_TICKET",
  "expires_at": "TICKET_EXPIRY_ISO8601"
}
```

Không trả credential tích hợp, Customer REST token hay Voice access/refresh token từ endpoint bootstrap. Ticket gateway hiện là chuỗi base64url 43 ký tự; `expires_at` là ISO8601 có timezone. Helper kiểm tra attempt, định dạng ticket/expiry và kích thước response, không hiển thị nội dung lỗi nhạy cảm. HTTP 401 yêu cầu ứng dụng đăng nhập lại bằng luồng hiện có.

### 4. Exchange và sẵn sàng gọi

SDK giữ verifier trong memory, không gửi cho backend doanh nghiệp. `loginWithTicket` tự gửi ticket, attempt, installation và verifier tới `POST /ACCOUNT_ID/api/v1/voice/sessions/exchange`. Chỉ attempt thuộc thế hệ hiện hành mới commit. Preparation mới không ngắt phiên/cuộc gọi đang có; exchange thành công mới thay thế phiên.

Exchange có kết quả không rõ thì tạo preparation/ticket mới; không retry ticket đã dùng hoặc fallback legacy login. SDK tự giữ access/refresh và đồng bộ push/readiness. Theo dõi `sessionState` và `readiness`; có token local chưa đồng nghĩa `canCall`/`canReceive`. Xin microphone từ tương tác phù hợp và gọi `resume()`/`checkReadiness()`.

## Hiệu lực, refresh và lưu trữ native

| Dữ liệu | Quy tắc |
|---|---|
| Preparation | Tối đa 120 giây; verifier chỉ ở memory |
| Ticket | Một lần, mặc định 60 giây, không vượt hạn phiên; dùng expiry server trả |
| Access Voice | Thông thường 15 phút, SDK tự refresh |
| Refresh/phiên | Hạn tuyệt đối theo chính sách server và phiên doanh nghiệp; rotation không kéo dài hạn này |
| Refresh mất response | Single-flight, UUID được lưu trước HTTP; retry cùng UUID/payload trong 30 giây kể cả restart |
| Phiên doanh nghiệp | Ứng dụng quản lý; SDK không lưu hoặc refresh phiên này |

iOS lưu access/refresh và pending UUID trong một record Keychain atomic, `AfterFirstUnlockThisDeviceOnly`; namespace/locator ngăn restore phiên đã logout hoặc record giữ lại sau reinstall. Android dùng storage được bảo vệ bằng Keystore. JS chỉ nhận metadata `SessionInfo`; không lưu Voice credentials vào AsyncStorage, UserDefaults, file cấu hình hoặc log. Verifier/ticket không persist. Secure storage không phải chứng thực thiết bị.

Quá cửa sổ refresh cần bootstrap mới. Mất mạng có thể giữ readiness UNKNOWN; không coi mọi lỗi mạng là logout. Hết hạn tự nhiên chặn cuộc gọi mới; cuộc gọi ACTIVE có thể hoàn tất bằng capability giới hạn snapshot/hangup/media-token tới deadline server. Thu hồi rõ ràng/logout dừng media. Capability không thay bearer chung; restart cần phiên hợp lệ để đồng bộ.

## Ngắt Voice và đăng xuất ứng dụng

**Ngắt Voice:** `await CustomerVoice.logout()` dừng media, dọn phiên/preparation local trước rồi cố revoke phiên Voice hiện tại. Tài khoản ứng dụng vẫn đăng nhập và có thể xin ticket mới. Đây là hành vi nút **Ngắt Voice** trong demo.

**Đăng xuất ứng dụng:** thực hiện cả SDK logout và logout doanh nghiệp hiện có, kể cả một bên lỗi. Tuần tự hóa chuyển tài khoản/đăng xuất với kết nối Voice để request và cleanup luôn gắn đúng phiên cũ. Ví dụ trong luồng ứng dụng:

```ts
// Chạy bên trong coordinator đã tuần tự hóa login/logout/chuyển tài khoản.
const results = await Promise.allSettled([
  CustomerVoice.logout(),
  existingAppSession.logout(),
]);
// Kiểm tra cả hai kết quả, báo lỗi hoặc thu hồi đang chờ; không bỏ qua lỗi host.
```

`existingAppSession` là thành phần đã có của doanh nghiệp. Backend vô hiệu hóa phiên host và ghi outbox HOST-revoke trong cùng transaction bền vững, từ đó chặn bootstrap mới. Worker dùng credential server:

```http
POST https://GATEWAY_HOST/ACCOUNT_ID/api/v1/voice/service/session-revocations
Authorization: Bearer SERVER_INTEGRATION_CREDENTIAL
X-Request-Id: STABLE_REVOCATION_UUID
Content-Type: application/json
```

```json
{"scope":"HOST","host_session_ref":"SERVER_HOST_SESSION_UUID"}
```

Retry cùng UUID và payload. Response trong `data` có `revocation_id`, `authority_revoked_at`, `cleanup_status`. `pending` chưa phải hoàn tất cleanup; theo dõi `GET /ACCOUNT_ID/api/v1/voice/service/session-revocations/REVOCATION_ID` bằng credential server và tiếp tục xử lý tới khi xác nhận. Không đặt outbox trong memory app.

Logout offline hoặc `LOGOUT_REVOKE_UNCONFIRMED` nghĩa local đã dọn nhưng chưa bảo đảm server thu hồi ngay. Không khôi phục token local đã xóa. Ngắt Voice không vô hiệu hóa phiên doanh nghiệp.

## Mã hóa và giới hạn nền tảng

API dùng HTTPS/TLS; media dùng WSS và WebRTC DTLS-SRTP. Không tắt kiểm tra chứng thư hoặc ATS. PKCE chứng minh sở hữu verifier, không mã hóa JSON, không thay xác thực phiên và không chứng thực thiết bị.

Khởi tạo native sớm từ Application/AppDelegate, không chờ JS hoặc HTTP trong push callback. iOS dùng CallKit/PushKit; Android forward FCM từ service hiện có, kèm Telecom/foreground service và quyền notification/full-screen phù hợp. Simulator/emulator kiểm tra UI/bridge/gọi ra; nhận cuộc gọi nền, cold start, khóa máy, Bluetooth, chuyển mạng và audio hai chiều phải nghiệm thu trên thiết bị thật. Không bảo đảm push sau Android Force stop.
