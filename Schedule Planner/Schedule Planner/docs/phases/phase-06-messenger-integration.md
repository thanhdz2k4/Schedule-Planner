# Phase 6 - Kết Nối Messenger Thật

## Mục tiêu

- Kết nối người dùng với kênh Messenger thật.
- Gửi tin nhắc từ `reminder_jobs` (Phase 5) qua Messenger.
- Có quy trình verify, test và debug rõ ràng.

---

## 1. Phụ thuộc trước khi bắt đầu

- Hoàn thành Phase 5 (`reminder_jobs` + worker).
- Có HTTPS endpoint public (dev dùng tunnel như ngrok/cloudflared).
- Có Facebook Page dùng để gửi nhận tin.

---

## 2. Kiến trúc luồng

1. User bấm "Kết nối Messenger" trong app.
2. App tạo phiên kết nối và redirect sang flow Facebook.
3. Facebook gọi webhook verify + event callback về app.
4. App lưu `page_id`, `recipient_id`, `access_token` (đã mã hóa).
5. Worker đến giờ nhắc gọi `sendMessengerMessage`.
6. Graph API trả thành công -> update `reminder_jobs.status = sent`.

---

## 3. Biến môi trường bắt buộc

```env
MESSENGER_APP_ID=
MESSENGER_APP_SECRET=
MESSENGER_VERIFY_TOKEN=
MESSENGER_PAGE_ACCESS_TOKEN=
MESSENGER_API_VERSION=v20.0
MESSENGER_GRAPH_BASE=https://graph.facebook.com
APP_BASE_URL=https://your-public-domain
```

Ghi chú:
- `MESSENGER_VERIFY_TOKEN`: chuỗi do bạn tự đặt, dùng để verify webhook.
- `MESSENGER_PAGE_ACCESS_TOKEN`: token Page để gửi message.
- Không commit `.env` lên git.

---

## 4. API contract cần có

## 4.1 `GET /api/messenger/webhook` (Facebook verify)

Mục đích:
- Facebook gọi endpoint này để xác nhận webhook.

Điều kiện trả thành công:
- `hub.mode === 'subscribe'`
- `hub.verify_token === MESSENGER_VERIFY_TOKEN`

Response:
- Trả đúng `hub.challenge` (status 200).

## 4.2 `POST /api/messenger/webhook` (nhận sự kiện)

Mục đích:
- Nhận event message, delivery, read...

Việc cần làm:
- Verify chữ ký header `X-Hub-Signature-256`.
- Parse payload.
- Lấy `sender.id` để map về user nội bộ.
- Log event phục vụ debug.

## 4.3 `POST /api/messenger/connect`

Mục đích:
- Khởi tạo flow kết nối Messenger từ app.

Input đề xuất:
- `userId`

Output đề xuất:
- `connectUrl` hoặc trạng thái kết nối hiện tại.

## 4.4 Hàm gửi tin `sendMessengerMessage(userId, text)`

Mục đích:
- Worker gọi hàm này khi tới `send_at`.

Request Graph API (mẫu):

```http
POST /v20.0/me/messages?access_token={PAGE_ACCESS_TOKEN}
Content-Type: application/json
```

```json
{
  "recipient": { "id": "PSID_USER" },
  "messaging_type": "MESSAGE_TAG",
  "tag": "ACCOUNT_UPDATE",
  "message": { "text": "Nhắc việc: 5 phút nữa bắt đầu task X" }
}
```

---

## 5. DB fields cần lưu

Bảng `messenger_connections` tối thiểu:

- `id`
- `user_id`
- `platform` (`messenger`)
- `page_id`
- `recipient_id` (PSID)
- `access_token_encrypted`
- `is_active`
- `connected_at`
- `updated_at`

Bảng `reminder_jobs` cần có:

- `status` (`pending`, `sent`, `failed`, `canceled`)
- `retry_count`
- `last_error`
- `sent_at`

---

## 6. Bảo mật bắt buộc

- Không log token thô.
- Mã hóa token trước khi lưu DB.
- Verify webhook signature trước khi xử lý payload.
- Validate payload schema để tránh lỗi parser.
- Áp dụng timeout + retry có giới hạn khi gọi Graph API.

Pseudo-code verify signature:

```js
const crypto = require("crypto");

function isValidSignature(rawBody, signatureHeader, appSecret) {
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ""));
}
```

---

## 7. Tích hợp vào Reminder Worker

Khi worker lấy job `pending`:

1. Load `messenger_connections` theo `user_id` và `is_active=true`.
2. Build message theo template reminder.
3. Gọi `sendMessengerMessage`.
4. Thành công -> `status=sent`, set `sent_at`.
5. Thất bại -> `status=failed` hoặc retry theo policy.

Template nhắc việc đề xuất:

```text
Nhắc việc: 5 phút nữa bắt đầu "{task_title}".
Thời gian: {start}-{end}
Ưu tiên: {priority}
```

---

## 8. Kịch bản test end-to-end

## 8.1 Test kết nối

- Gọi `/api/messenger/connect`.
- Hoàn tất flow Facebook.
- DB có bản ghi `messenger_connections.is_active = true`.

## 8.2 Test gửi tin thủ công

- Tạo endpoint nội bộ test gửi.
- Gửi 1 tin "test reminder".
- Xác nhận tin xuất hiện trên Messenger.

## 8.3 Test reminder thật

- Tạo task bắt đầu sau 6-7 phút.
- Xác nhận có `reminder_job`.
- Chờ đến `start - 5 phút`.
- Kiểm tra tin nhắn nhận được.
- Kiểm tra `reminder_jobs.status = sent`.

---

## 9. Troubleshooting nhanh

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Verify webhook fail | Sai `verify_token` | Kiểm tra `MESSENGER_VERIFY_TOKEN` |
| Không nhận event webhook | URL không public/HTTPS | Bật tunnel HTTPS, update callback URL |
| Gửi tin fail 401/403 | Token hết hạn/sai quyền | Refresh token và cấp đúng permission |
| Worker không gửi | Không map được `recipient_id` | Kiểm tra bảng `messenger_connections` |
| Gửi trùng | Retry thiếu idempotency | Thêm idempotency theo `reminder_job.id` |

---

## 10. Tiêu chí hoàn thành phase

- User kết nối Messenger thành công từ app.
- Webhook verify thành công.
- Gửi test message thành công.
- Reminder thật được gửi trước giờ task 5 phút.
- Có log đủ để truy vết lỗi.

## Output cần nộp

- Ảnh/video kết nối thành công.
- Ảnh/video nhận reminder thật.
- Log 1 job `sent` và 1 case `failed` (nếu có) để chứng minh retry/error handling.
