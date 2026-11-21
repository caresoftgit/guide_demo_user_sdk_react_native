# Build và nghiệm thu React Native

## Chuẩn bị demo

1. Làm đủ các bước [tích hợp](integration.md), cấu hình Caresoft App/push, điền `config/voice.local.json`, chạy `npm run configure`.
2. Android: đặt package/Firebase client đúng ứng dụng. iOS: đặt Bundle ID, signing, APNs environment và push capabilities đúng môi trường. Không nhập private key server vào app.
3. Chạy `npm ci`, `npm test`, `npm run typecheck`. iOS chạy `cd ios && pod install`, mở CustomerVoiceDemo.xcworkspace.
4. Build Android bằng `cd android && ./gradlew :app:assembleDebug :app:assembleRelease :app:lint`. Demo release dùng debug signing chỉ cho test local. Build iOS simulator bằng Xcode; iPhone dùng signing của bạn.
5. Mở demo, cấp quyền rồi đăng nhập bằng thông tin khách hàng test của bạn. Nếu chưa cấu hình, Home phải hướng dẫn cấu hình và khóa nút Gọi CSKH.

## Kiểm thử trên emulator/simulator

- Home hiển thị đúng: chưa cấu hình/chưa đăng nhập/sẵn sàng; không có dialer hay trạng thái agent.
- Native module liên kết, snapshot lấy được; sai config/missing bootstrap được báo rõ.
- Nhập login sai và kiểm tra lỗi an toàn; logout về Home, mở lại form login được.
- Reload JS hoặc remount component không được tự logout/hangup hoặc tạo call mới.

Emulator/simulator không xác nhận chất lượng audio, APNs/FCM, lockscreen hoặc chuyển Wi-Fi/di động. Chỉ đăng nhập/gọi được khi đã cấu hình gateway và routing thật hoặc fixture có đủ endpoint; bản bàn giao không có tài khoản dùng sẵn.

## Nghiệm thu thiết bị Android và iPhone

| Ca | Kết quả cần đạt |
|---|---|
| Login/restore | Readiness cập nhật; mở lại app khôi phục phiên native, verifier/access/refresh luôn thuộc native |
| Logout/login khác | Dừng call local, không hiện session/call của khách cũ; form login nhập được phiên mới |
| Gọi CSKH | Gọi đúng đầu số host cấu hình; bấm nhanh không tạo nhiều call |
| Agent trả lời / IVR | ACTIVE theo hợp đồng gateway hiện có; không suy đoán thời điểm agent sau IVR |
| Foreground/background | UI native; trả lời/từ chối/gác máy hoạt động; về Home rồi bấm Quay lại cuộc gọi giữ nguyên cuộc gọi và âm thanh |
| Khóa màn hình / cold start | CallKit/notification native khi OS chuyển push, không đợi JS |
| Mic | Tắt/bật nhiều lần; agent nghe lại được sau khi bật |
| Audio route | Loa thoại/ngoài/Bluetooth, UI phản ánh route thực tế |
| Uplink/downlink | Nói liên tục hai chiều, không giật/mất tiếng kéo dài |
| DTMF | Bấm số trong call, tổng đài nhận đúng |
| Wi-Fi ↔ di động | Hiện reconnect, khôi phục cùng call, giữ mute |
| Mất media >30 giây | Kết thúc local, đóng UI, về Home |
| Agent gác / hủy incoming | Đóng UI/notification, không treo cuộc gọi |
| Thiết bị khác trả lời | Thiết bị còn lại dừng ringing theo event/push server |
| Reload JS khi gọi | Media tiếp tục, attach lại đọc đúng state, mở lại UI được |
| Push token rotation | Đăng ký đúng session, request cũ không ghi đè |
| Offline logout/hangup | Dừng local dù server chưa phản hồi; không replay |

Android: bật notification/full-screen đúng OS; force-stop có thể chặn FCM đến khi mở lại ứng dụng. iOS: APNs production cần ký production (ví dụ TestFlight), sandbox cần profile/config tương ứng. canReceive=true không chứng minh push đã đến.

## Thu thập lỗi

Ghi OS, thiết bị, SDK version, thời điểm, callId, mã lỗi, kết nối và thao tác tái hiện. Không gửi account/session/push token, private key hoặc payload/media credential vào log công khai. Phân biệt routing/server với media/permission trên máy.

Xem [kết quả bản bàn giao](validation.md) để biết phần đã kiểm chứng và phần cần nghiệm thu thiết bị. Build local không tự publish npm, gửi push thật hoặc upload TestFlight.

## Secure ticket và host logout

Chạy `npm run test:host` trước kiểm thử thiết bị. Dùng gateway protocol 2 và integration credential scoped cho đúng account/app. Cấu hình `enterpriseBackendUrl` HTTPS, tài khoản fixture server-side và user_id có ownership hợp lệ.

| Ca | Kết quả cần đạt |
|---|---|
| Fixture tắt / sai mật khẩu | Host từ chối, chưa issue ticket |
| Bootstrap thiếu enterprise bearer | HTTP 401 |
| Bootstrap gửi user_id hoặc code_verifier | HTTP 400, gateway chưa nhận issue |
| Đăng nhập Android / iOS | Native prepare dùng đúng package/Bundle ID và push environment, bridge chỉ trả metadata protocol 2 |
| Ticket sai/hết hạn/đã consume | Đăng nhập thất bại, bootstrap lại bằng attempt mới qua host |
| Response exchange mất | Attempt mới thay phiên chưa nhận được theo cùng installation, không tự replay exchange |
| Refresh concurrent | Native single-flight, JavaScript tiếp tục chỉ nhận metadata |
| Logout khi native revoke lỗi | Local loggedOut, host vẫn nhận logout và lưu outbox |
| Gateway tạm lỗi lúc logout | Host đã inactive, bootstrap bị chặn, worker retry cùng request UUID sau restart |
| Revoke pending | Status vẫn pending đến gateway done, sau đó host hiển thị completed |
| Offline trước host logout | Demo báo HOST_LOGOUT_PENDING và có nút thử lại, server chưa xác nhận |
| Absolute expiry / ACTIVE call | Call đang active theo capability native, không tạo hoặc answer call mới |
| Explicit revoke | Quyền phiên bị thu hồi theo gateway, kiểm tra event/push/media teardown thực tế |

Giữ capture network và log redaction trên cả proxy/host/app. Ticket, enterprise bearer, native access/refresh/verifier và push/private key là dữ liệu cần loại khỏi telemetry. Đóng JS process xóa enterprise bearer memory và pending host delivery của demo. Kiểm thử production cần cơ chế enterprise session/logout bền vững của host.
