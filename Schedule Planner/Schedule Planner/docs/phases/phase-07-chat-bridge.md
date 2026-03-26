# Phase 7 - Chat Bridge (Telegram <-> Agent Lab)

## 1. Muc tieu

- Bien Telegram thanh giao dien chat chinh cua tro ly.
- Dong bo 2 chieu giua Agent Lab va Telegram.
- Moi message deu vao cung 1 engine route/workflow.

## 2. Pham vi

Trong phase nay lam:

- Webhook nhan message Telegram vao app.
- Mapping `telegram_chat_id` <-> `conversation_thread` theo user.
- Reply nguoc lai Telegram tu ket qua workflow.

Chua lam:

- Voice call / audio streaming.
- Group moderation rules phuc tap.

## 3. Kien truc de xuat

```text
Telegram Update Webhook
  -> Inbound Normalizer
  -> Agent Router + Workflow Engine
  -> Outbound Sender (Nango Telegram)
```

## 4. DB bo sung

- `chat_threads`
  - `id`, `user_id`, `channel`, `external_chat_id`, `title`, `last_message_at`
- `chat_messages`
  - `id`, `thread_id`, `role`, `content`, `raw_payload`, `created_at`

## 5. API/Endpoint can co

- `POST /api/chat/telegram/webhook`
- `POST /api/chat/telegram/reply`
- `GET /api/chat/threads`
- `GET /api/chat/threads/{id}/messages`

## 6. Checklist

1. Verify webhook signature truoc khi xu ly.
2. Chuan hoa inbound message schema.
3. Goi workflow engine nhu Agent Lab.
4. Luu full trace message vao DB.
5. Gui reply qua Nango Telegram sender.

## 7. Kiem thu toi thieu

- Chat 1-1 tren Telegram nhan reply dung.
- Message error trong workflow van co fallback reply.
- Agent Lab va Telegram thay cung history thread.

## 8. Tieu chi hoan thanh

- User co the chat voi tro ly tu Telegram.
- Thread memory su dung lai duoc cho turn tiep theo.
- Co log truy vet 1 turn end-to-end.

## 9. Quick setup de test ngay

1. Set bien moi truong:
   - `NANGO_INTEGRATION_TELEGRAM`
   - `NANGO_SECRET_KEY`
   - `TELEGRAM_WEBHOOK_SECRET_TOKEN` (khuyen nghi)
2. Connect Telegram tren trang Integrations va luu `chat id`.
3. Expose app URL public (ngrok/cloudflared) va set webhook Telegram:
   - `POST /api/chat/telegram/webhook`
4. Nhan `/start` cho bot, sau do nhan tin task/query bat ky.
5. Kiem tra log/history qua:
   - `GET /api/chat/threads`
   - `GET /api/chat/threads/{id}/messages`
