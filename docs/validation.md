# Tiêu chí nghiệm thu tích hợp

Ghi phiên bản ứng dụng/SDK, OS/thiết bị, môi trường và kết quả trong báo cáo riêng của doanh nghiệp; không đưa user_id thật, credential, URL nội bộ hoặc log có token vào tài liệu public.

| Nhóm | Điều kiện đạt |
|---|---|
| Cài đặt | Checksum package đúng; Android/iOS build được với native artifact đi kèm |
| Cấu hình | Account/App/package/Bundle ID/push environment khớp; không có secret server trong app |
| Xác thực | Bootstrap qua phiên doanh nghiệp; user_id lấy ở server; ticket một lần và PKCE kiểm tra đầy đủ |
| Phiên | Restore/refresh/expiry đúng; JS chỉ thấy metadata; đổi tài khoản được tuần tự hóa |
| Logout | Dọn local; host logout chặn bootstrap; outbox retry/poll đến cleanup done |
| Gọi | Hai chiều audio, điều khiển, chống tạo trùng, trở lại call và kết thúc UI đúng |
| Push | Nhận/hủy foreground/background/khóa/cold start trên thiết bị thật |
| Mạng | UNKNOWN khi chưa xác minh; phục hồi hoặc kết thúc native đúng deadline |
| Riêng tư | Không lộ credentials/định danh nội bộ trong log, source hay báo cáo |

Thực hiện [kiểm thử](testing.md) và đối chiếu [hợp đồng backend](host-bootstrap.md) trước phát hành. Mỗi app cần nghiệm thu với signing/push/HTTP client của chính doanh nghiệp.
