# API Customer Voice React Native 0.5.0

Import `{CustomerVoice, CustomerVoiceError}` từ `@caresoft/customer-voice-react-native`. API điều khiển trả Promise; state/events dùng callback. Native bootstrap phải chạy trước JavaScript (Application/AppDelegate), theo hướng dẫn tích hợp trong bộ demo.

## Phiên và sẵn sàng

| Hàm | Kết quả / sử dụng |
|---|---|
| `initialize(config)` | `Promise<void>`, xác nhận config khớp native bootstrap; không tạo engine mới |
| `prepareLogin()` | `LoginPreparation` chứa challenge S256 cho bootstrap host |
| `loginWithTicket(attemptId, ticket)` | `SessionInfo` sau native exchange ticket và verifier |
| `logout()` | Dọn local, kết thúc call và thu hồi phiên; lỗi revoke không khôi phục local session |
| `checkReadiness()` | `VoiceReadiness`, xác minh khả năng gọi/nhận hiện tại |
| `resume()` | Đồng bộ lại phiên/call khi app foreground; không tự tạo cuộc gọi |
| `synchronize()` | Chờ lấy danh sách call/readiness từ server; trả snapshot mới, lỗi sẽ giữ yêu cầu đồng bộ ở host |
| `getState()` | Snapshot đầy đủ hiện tại |

`config`: `backendUrl`, `accountId`, `appId`, `supportName?`, `pushEnvironment?: 'production'|'sandbox'`. Ba ID/backend phải giống cấu hình native; iOS còn kiểm tra environment. Android không dùng APNs environment. Account/User ID truyền chuỗi số, không dùng số JavaScript. Integration credential chỉ nằm ở backend doanh nghiệp. Backend lấy user_id từ principal đã xác thực.

`LoginPreparation` gồm `attemptId`, `installationId`, `platform`, `applicationId`, `pushEnvironment`, `codeChallenge`, `codeChallengeMethod` bằng `S256`. Native giữ verifier và pending attempt. Attempt mới thay pending attempt cũ, có hạn 120 giây local. Gateway quyết định hạn ticket.

`SessionInfo` gồm `userId`, `sessionId`, `expiresAt`, `sessionExpiresAt` (ISO8601) và `authProtocol` bằng `2`. `sessionState` có `status: 'loggedOut'`, `'authenticated'` kèm `session`, hoặc `'loginRequired'` kèm `reason`.

`VoiceReadiness`: `sessionStatus: 'LOGGED_OUT'|'VALID'|'UNKNOWN'|'EXPIRED'`, `isLoggedIn`, `canCall`, `canReceive`, `userId`, `reasons: string[]`, `checkedAt`, `controlConnected`. UNKNOWN khi chưa xác minh được phiên không đồng nghĩa logout. canReceive không thay cho kiểm thử chuyển push thực tế.

## Gọi và điều khiển

| Hàm | Tham số / kết quả |
|---|---|
| `call(businessNumber)` | Đầu số host được cấp: 1–32 chữ số, có thể có `+` đầu; trả `CallSnapshot` |
| `answer(callId)` / `reject(callId)` / `hangup(callId)` | `Promise<void>`; native kiểm tra quyền sở hữu/trạng thái |
| `setMuted(callId, muted)` | Bật/tắt micro, theo dõi audioStates để hiển thị kết quả |
| `getAvailableAudioRoutes(callId)` | `AudioRoute[]` với `id`, `name`, `selected` |
| `selectAudioRoute(callId, routeId)` | Chọn ID có trong danh sách mới nhất; không đoán theo tên loa |
| `sendDtmf(callId, digit)` | Một ký tự `0`–`9`, `*`, `#` hoặc `A`–`D`; native quyết định khi được gửi |
| `showCall(callId)` | Hiển thị lại UI native cho call còn presentable; không tạo call |

UI cuộc gọi có sẵn; host không cần xây lại màn hình. `call()` không có automatic retry. Khi mất response hãy resume/đọc snapshot trước khi cho gọi mới. `hangup` có thể trả lỗi signaling nhưng local call/UI đã dừng theo hành vi native.

`CallSnapshot`: `callId`, `direction: 'INBOUND'|'OUTBOUND'`, `state`, `version` (chuỗi), `businessNumber`, `ringingExpiresAt`, `mediaExpiresAt`, `endedAt`, `endReason`, `deviceStatus`, `isOwner`, `presentable`. Các field nullable là null khi chưa có. `presentable` dùng khi cần nút trở lại call; không suy ra chỉ từ state ACTIVE. Thời gian dùng ISO8601.

`connectionStates[callId]`: CONNECTING, CONNECTED hoặc RECONNECTING; `audioStates[callId]`: `{muted, routes}`. Native phục hồi media trong cùng call, giữ mute; sau 30 giây liên tục không phục hồi sẽ kết thúc local với NETWORK_RECOVERY_TIMEOUT. Không gọi lại `call()` từ sự kiện reconnect.

## Quan sát

```ts
const offState = CustomerVoice.subscribeState(state => {
  // state.sessionState, readiness, calls, audioStates, connectionStates
});
const offEvents = CustomerVoice.subscribeEvents(event => {
  // {type, callId: string|null, code: string|null}
});
// Khi component unmount:
offState(); offEvents();
```

Subscribe state trước khi lấy snapshot ban đầu; `revision` tăng đơn điệu trong process native giúp loại snapshot cũ đến muộn. Events là thông báo tức thời, không replay lịch sử; luôn dựng UI từ state đầy đủ khi attach lại. `dispose()` chỉ hủy các observer JS, không logout/hangup. Không gọi dispose của singleton trong một component nếu component khác còn dùng observer.

State public không có access/refresh/account token, media credential hoặc nội dung push. Ticket, push token, enterprise bearer và mọi credential phải được redaction khỏi log, crash report, analytics và URL. Native tự quản lý refresh single-flight và storage.

Khi ticket hết hạn hoặc exchange mất response, bắt đầu attempt mới qua host còn đăng nhập. `logout()` dọn local trước, rồi app luôn gửi enterprise logout để host ghi durable revoke outbox. Khi offline, giao diện phải báo host chưa nhận được yêu cầu. Sau khi host nhận, outbox retry/poll đến completion. Absolute session expiry cho phép call ACTIVE đang có hoàn tất theo capability native và hard deadline. Explicit revoke dừng quyền phiên theo gateway.

## Push và quyền

| Hàm JS | Ý nghĩa |
|---|---|
| `updatePushToken(token)` | FCM token Android / VoIP token iOS; thông thường để native bootstrap tự quản lý |
| `unregisterPushToken()` | Hủy đăng ký push hiện tại; không logout. Android không tự đăng ký lại trong cùng session khi resume/rotation, đến explicit update hoặc login phiên mới |
| `requestMicrophonePermission()` | `boolean`; gọi từ thao tác người dùng |
| `canShowIncomingScreen()` | Kiểm tra full-screen Android; iOS trả true vì dùng CallKit |
| `requestIncomingScreenPermission()` | Mở quyền full-screen Android khi cần; iOS không làm gì |

FCM, PushKit, APNs notification phải được forward từ native trước khi JS chạy. Không dùng callback JS làm đường nhận cuộc gọi nền duy nhất. Android POST_NOTIFICATIONS do host xin. iOS APNs notification token thường forward riêng qua AppDelegate, không dùng updatePushToken thay thế.

## Lỗi

Bắt `CustomerVoiceError`, đọc `code` và `status` (0 nếu không có HTTP status). Không phụ thuộc message network. Các mã thường cần xử lý:

| Mã | Host xử lý |
|---|---|
| NATIVE_MODULE_NOT_LINKED | Cài Pods/autolinking và build native lại, không chỉ reload Metro |
| NATIVE_BOOTSTRAP_REQUIRED / CONFIGURATION_MISMATCH | Kiểm tra Application/AppDelegate và config JS |
| INVALID_ARGUMENT / INVALID_BUSINESS_NUMBER / INVALID_DTMF | Sửa input |
| INVALID_LOGIN_TICKET / LOGIN_ATTEMPT_EXPIRED | Tạo attempt mới rồi bootstrap qua host còn đăng nhập |
| LOGIN_REQUIRED / UNAUTHORIZED | Về luồng xác thực của host; không login lặp khi offline |
| MICROPHONE_PERMISSION_REQUIRED | Hướng dẫn cấp quyền |
| ROUTE_UNAVAILABLE | Đọc lại audio routes |
| ACTIVITY_REQUIRED / HOST_VIEW_REQUIRED | Thao tác UI khi native host sẵn sàng |
| LOGOUT_REVOKE_UNCONFIRMED | Giữ trạng thái local đã logout, thông báo server chưa xác nhận |
| NETWORK_RECOVERY_TIMEOUT | Call đã dừng local; chỉ tạo call mới từ ý định người dùng |
| VOICE_OPERATION_FAILED | Thông báo chung, đồng bộ state trước khi thử lại |

Native có thể trả thêm mã nghiệp vụ. Không tự replay mutation khi gặp mã lạ.
