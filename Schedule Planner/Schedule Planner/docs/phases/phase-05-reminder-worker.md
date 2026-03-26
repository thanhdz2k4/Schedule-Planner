# Phase 5 - Gmail Reminder Delivery (via Nango)

## 1. Muc tieu

- Gui reminder "sap den lich" bang Gmail thong qua ket noi Nango.
- Van hanh on dinh voi retry, idempotency, va logging day du.
- Giu luong worker doc lap de sau nay them kenh moi khong pha vo code.

## 2. Pham vi

Trong phase nay lam:

- Noi `reminder_jobs` voi `integration_connections` (`integration_id = gmail`).
- Gui email reminder qua Nango (Proxy hoac Action).
- Ghi nhan ket qua delivery vao DB.

Chua lam:

- Multi-channel fallback (Phase 6).
- Channel intelligence (Phase 8).

## 3. Luong reminder Gmail

1. Task create/update -> tinh `send_at = start_time - lead_time`.
2. Tao/Upsert `reminder_jobs` status `pending`.
3. Worker quet job den han.
4. Worker load connection Gmail active cua user.
5. Worker goi Nango de gui email reminder.
6. Thanh cong -> `sent`; loi -> retry hoac `failed`.

## 4. DB cap nhat de xuat

Bo sung truong cho `reminder_jobs`:

- `integration_id` (mac dinh `gmail`)
- `connection_id` (nullable, gan khi dispatch)
- `delivery_provider` (vd: `nango-gmail`)
- `external_message_id` (message id tu Gmail/Nango)

Them bang log delivery (khuyen nghi):

- `reminder_deliveries`
- luu request id, error code, retry count, duration.

## 5. Cau truc code de xuat

```text
worker/
  reminderWorker.js
lib/reminder/
  scheduler.js
  retryPolicy.js
  formatter.js
lib/integrations/
  nangoClient.js
  gmailSender.js
```

## 6. Cach gui Gmail qua Nango

Huong de xuat cho phase nay:

- Bat dau voi Nango Proxy de gui Gmail API call.
- Chuan bi abstraction de sau nay co the doi sang Nango Action.

Hop dong ham:

```js
sendGmailReminder({
  connectionId,
  integrationId: "gmail",
  toEmail,
  subject,
  htmlBody,
  textBody
});
```

Note:

- Gmail send message yeu cau payload MIME (RFC 2822) dang `raw` (base64url).
- Luu y timezone khi tao noi dung nhac lich.

## 7. Retry va idempotency

Retry policy de xuat:

- Lan 1: +30s
- Lan 2: +120s
- Lan 3: +300s
- Qua nguong: `failed`

Idempotency:

- Moi `reminder_job.id` chi duoc danh dau `sent` 1 lan.
- Truoc khi gui phai lock row/job (hoac optimistic check status).

## 8. Template email reminder v1

Subject:

```text
[Schedule Planner] Nhac lich: "{task_title}" bat dau sau 5 phut
```

Body:

```text
Xin chao,
Ban co lich sap den:
- Task: {task_title}
- Thoi gian: {start_time} - {end_time}
- Uu tien: {priority}
```

## 9. Checklist trien khai

1. Mapping user -> gmail connection khi worker dispatch.
2. Implement `gmailSender` qua Nango.
3. Update lifecycle `reminder_jobs` + retry.
4. Them endpoint test dispatch thu cong.
5. Ghi log chi tiet moi lan send/retry/fail.

## 10. Kiem thu toi thieu

- Case success: task bat dau sau 6-7 phut -> nhan email dung thoi diem.
- Case khong co connection: job fail ro ly do.
- Case loi tam thoi: retry dung policy.
- Case idempotency: khong gui trung khi worker restart.

## 11. Tieu chi hoan thanh

- Reminder qua Gmail gui duoc o moi truong dev/staging.
- Retry + failure handling hoat dong dung.
- Co log va DB state de truy vet 1 job end-to-end.

## 12. Output can nop

- Log 1 job `sent` va 1 job `failed`.
- Screenshot email reminder nhan duoc.
- SQL snapshot `reminder_jobs` + `reminder_deliveries`.

## 13. Tai lieu tham khao Nango

- Nango Actions: https://nango.dev/docs/implementation-guides/actions/implement-an-action
- Nango Proxy (example usage): https://nango.dev/docs/integrations/all/slack
