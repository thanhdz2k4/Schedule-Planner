# Phase 6 - Multi-platform Notification Expansion (Nango)

## 1. Muc tieu

- Mo rong tu Gmail sang nhieu kenh thong bao khac qua cung mot abstraction.
- Tach logic kenh (provider-specific) khoi reminder worker.
- Cho phep user cau hinh kenh uu tien va fallback.

## 2. Pham vi

Trong phase nay lam:

- Thiet ke notification channel abstraction.
- Them kenh thu 2 (goi y: Slack hoac Teams) qua Nango.
- Implement fallback strategy `primary -> secondary`.

Chua lam:

- AI tu dong chon kenh (Phase 8).

## 3. Kien truc de xuat

```text
Reminder Worker
  -> Channel Orchestrator
      -> Gmail Adapter (Nango)
      -> Slack Adapter (Nango)
      -> Teams Adapter (future)
```

Contract chung:

```ts
sendReminder(channel, payload): Promise<DeliveryResult>
```

## 4. Mo hinh du lieu bo sung

Bang `notification_channel_settings`:

- `user_id`
- `channel` (`gmail`, `slack`, `teams`)
- `integration_id`
- `connection_id`
- `is_enabled`
- `priority_order`
- `quiet_hours_config` (jsonb)

Bang `reminder_delivery_attempts`:

- `job_id`
- `channel`
- `attempt_no`
- `status`
- `error_code`
- `error_message`
- `sent_at`

## 5. Quy tac fallback de xuat

1. Lay danh sach channel enable theo `priority_order`.
2. Thu channel dau tien.
3. Neu fail voi loi co the retry -> retry tai channel do.
4. Neu loi hard fail (auth/permission) -> chuyen channel tiep theo.
5. Neu het channel -> job `failed`.

## 6. API/UX can co

- `GET /api/notification/channels`
- `PUT /api/notification/channels`
- `POST /api/notification/channels/{channel}/connect-session`
- `POST /api/notification/channels/reconnect-session`

UI:

- Trang "Integrations":
  - Hien trang thai ket noi tung kenh.
  - Nut Connect / Reconnect / Disable.
  - Keo-tha thu tu uu tien kenh.

## 7. Checklist trien khai

1. Tach `gmailSender` thanh adapter pattern.
2. Tao interface chung cho moi channel adapter.
3. Them 1 adapter moi (Slack/Teams) qua Nango.
4. Them orchestration fallback.
5. Update worker de goi orchestrator thay vi goi truc tiep Gmail.
6. Them integration settings UI/API.

## 8. Bao mat va van hanh

- Kiem tra connection validity dinh ky.
- Neu connection invalid: danh dau status `error`, canh bao reconnect.
- Khong luu token provider trong app DB (chi luu metadata connection).

## 9. Kiem thu toi thieu

- User co 2 kenh active, kenh 1 fail -> kenh 2 send thanh cong.
- User tat kenh 1 -> worker chi gui kenh 2.
- Reconnect flow khac phuc duoc connection invalid.

## 10. Tieu chi hoan thanh

- Reminder worker gui duoc qua it nhat 2 kenh.
- Fallback hoat dong dung theo policy.
- User cau hinh duoc thu tu kenh tu UI/API.

## 11. Output can nop

- Demo video fallback 2 kenh.
- Log delivery attempts theo tung channel.
- Screenshot trang Integrations voi status ket noi.
