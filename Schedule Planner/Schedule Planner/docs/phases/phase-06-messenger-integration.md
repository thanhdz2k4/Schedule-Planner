# Phase 6 - Telegram Reminder Channel (via Nango)

## 1. Muc tieu

- Mo rong reminder tu Gmail sang Telegram qua Nango.
- Ho tro fallback channel theo uu tien (Telegram -> Gmail).
- Cho phep user cau hinh Telegram chat id theo tung tai khoan.

## 2. Pham vi

Trong phase nay lam:

- Them integration Telegram vao Connect flow (Nango).
- Them channel settings API/UI de luu destination (Telegram chat id), enable/disable, priority.
- Worker dispatch reminder theo thu tu channel settings.

Chua lam:

- Tu dong AI chon channel theo context (Phase 8).
- Rule quiet hours phuc tap.

## 3. Kien truc da ap dung

```text
Reminder Worker
  -> Load notification_channel_settings
  -> Try Telegram adapter (Nango Proxy)
  -> Fallback Gmail adapter (Nango Proxy)
  -> Log reminder_deliveries per attempt
```

## 4. Bien moi truong can co

```env
NANGO_INTEGRATION_GMAIL=
NANGO_INTEGRATION_TELEGRAM=
NANGO_TELEGRAM_SEND_PATH=/proxy/sendMessage
TELEGRAM_DEFAULT_CHAT_ID=
```

Ghi chu:

- `NANGO_INTEGRATION_TELEGRAM`: provider config key Telegram trong Nango.
- `NANGO_TELEGRAM_SEND_PATH`: endpoint proxy cho Telegram send message.
- `TELEGRAM_DEFAULT_CHAT_ID`: fallback chat id neu user chua set destination rieng.

## 5. DB bo sung

- `007_notification_channel_settings_phase6.sql`

Bang `notification_channel_settings`:

- `user_id`
- `channel` (`telegram`, `gmail`)
- `is_enabled`
- `priority_order`
- `destination` (Telegram chat id hoac destination override)

## 6. API phase 6

- `GET /api/notification/channels`
  - Lay setting channel + trang thai ket noi.
- `PUT /api/notification/channels`
  - Cap nhat enable/priority/destination.
- `POST /api/integrations/telegram/test-send`
  - Gui test message Telegram.

## 7. UI phase 6

Trang `Integrations`:

- Co card Telegram (icon, connect/reconnect).
- Co input `chat id` + nut save destination.
- Co nut `Send test message`.

## 8. Worker fallback

Thu tu xu ly:

1. Lay danh sach channel dang enable sap theo `priority_order`.
2. Thu channel dau tien.
3. Neu loi retryable -> schedule retry cho channel do.
4. Neu loi hard fail (missing connection/destination/auth) -> thu channel tiep theo.
5. Neu het channel -> danh dau `failed`.

## 9. Checklist kiem thu

- Telegram connected + chat id hop le -> nhan tin nhac lich.
- Telegram fail hard -> worker fallback qua Gmail.
- Tat Telegram channel -> worker bo qua Telegram.
- Reconnect Telegram -> test-send thanh cong.

## 10. Tieu chi hoan thanh

- Agent Lab/Worker gui reminder duoc qua Telegram khi user da connect.
- Fallback Telegram -> Gmail chay dung.
- User quan ly duoc destination + priority tren UI/API.

## 11. Phase tiep theo de di den OpenClaw assistant

- Phase 7: Chat Bridge Telegram <-> Agent Lab.
- Phase 8: Personal Memory Engine.
- Phase 9: Personal Knowledge Vault (RAG).
- Phase 10: Proactive Planner & Auto-Execution.
- Phase 11: Tool Runtime & Multi-App Automation.
- Phase 12: Voice & Multimodal Assistant.
- Phase 13: OpenClaw Readiness.

Xem chi tiet trong `docs/phases/README.md`.

## 12. Mo rong roadmap (tom tat theo kha nang)

1. Phase 7 - Chat Bridge:
   Telegram tro thanh kenh chat truc tiep voi assistant.
2. Phase 8 - Personal Memory:
   Assistant nho so thich, thoi quen, context theo tung user.
3. Phase 9 - Knowledge Vault:
   Nap tri thuc ca nhan va tra loi co citation.
4. Phase 10 - Proactive Planner:
   Tu de xuat ke hoach va nhac viec chu dong.
5. Phase 11 - Tool Runtime:
   Chay workflow da cong cu qua Nango/tool adapter.
6. Phase 12 - Voice & Multimodal:
   Nhap voice, document, image va phan hoi da kenh.
7. Phase 13 - OpenClaw Readiness:
   Hardening security/privacy/ops de san sang production.
