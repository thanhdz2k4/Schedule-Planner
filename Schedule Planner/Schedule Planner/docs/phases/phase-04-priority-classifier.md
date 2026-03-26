# Phase 4 - Nango Integration Foundation

## 1. Muc tieu

- Chuan hoa lop ket noi API ben ngoai qua Nango.
- Tao flow OAuth an toan de user ket noi tai khoan (uu tien Gmail).
- Luu va quan ly `connection_id` theo user noi bo, san sang cho reminder da kenh.

## 2. Pham vi

Trong phase nay lam:

- Tich hop Nango Connect Session flow (backend + frontend).
- Nhan webhook auth tu Nango, verify chu ky, luu ket qua ket noi.
- Dinh nghia model DB generic cho multi-platform integrations.

Chua lam:

- Gui reminder qua Gmail (se lam o Phase 5).
- Mo rong kenh thu 2 (se lam o Phase 6).

## 3. Kien truc luong ket noi

1. Frontend bam "Connect Gmail".
2. Backend goi Nango tao connect session token.
3. Frontend mo Nango Connect UI.
4. User authorize Google OAuth.
5. Nango goi webhook `auth` ve backend.
6. Backend luu `integration_id`, `connection_id`, `user_id`, `status`.

## 4. Bien moi truong can co

```env
NANGO_SECRET_KEY=
NANGO_BASE_URL=https://api.nango.dev
NANGO_WEBHOOK_SECRET=
NANGO_INTEGRATION_GMAIL=gmail
```

Ghi chu:

- `NANGO_SECRET_KEY`: dung cho API server-to-server.
- `NANGO_WEBHOOK_SECRET`: dung verify webhook signature.
- Tach ro dev/staging/prod key, khong dung chung.

## 5. DB model de xuat (generic)

Tao bang moi (hoac migrate tu `messenger_connections`) ten `integration_connections`:

- `id` (uuid)
- `user_id` (uuid, FK users)
- `integration_id` (vd: `gmail`, `slack`, `teams`)
- `connection_id` (string, unique theo integration)
- `provider` (vd: `google-mail`)
- `status` (`active`, `disconnected`, `error`)
- `last_error` (text, nullable)
- `connected_at`
- `updated_at`

Chi so de xuat:

- unique (`user_id`, `integration_id`)
- index (`connection_id`)

## 6. API contract de xuat

### 6.1 `POST /api/integrations/connect/session`

Input:

```json
{
  "integrationId": "gmail"
}
```

Output:

```json
{
  "sessionToken": "<NANGO_CONNECT_SESSION_TOKEN>"
}
```

Ghi chu:

- Backend tao token bang Nango API create connect session.
- Gan tags bat buoc: `end_user_id`, `end_user_email`.

### 6.2 `POST /api/integrations/webhooks/nango`

- Verify signature tu header webhook.
- Chi xu ly event auth lien quan toi connection.
- Upsert vao `integration_connections`.

### 6.3 `GET /api/integrations/connections`

- Tra danh sach ket noi hien tai cua user.
- Frontend dung de hien thi state connected/disconnected.

## 7. Checklist trien khai

1. Tao service `lib/integrations/nangoClient.js`.
2. Implement endpoint tao connect session token.
3. Gan Connect UI vao trang setting/account.
4. Tao endpoint webhook + verify signature.
5. Upsert `integration_connections` khi auth success.
6. Them reconnect button cho connection invalid.

## 8. Bao mat bat buoc

- Khong expose `NANGO_SECRET_KEY` len frontend.
- Khong tin `connection_id` tu frontend o production.
- Webhook phai verify signature truoc khi ghi DB.
- Ghi log co redact secrets/token.

## 9. Kiem thu toi thieu

- Tao connect session token thanh cong.
- OAuth flow Gmail thanh cong, webhook vao duoc.
- `integration_connections` co 1 ban ghi `active`.
- Thu case webhook signature sai -> bi reject.

## 10. Tieu chi hoan thanh

- User co the ket noi Gmail tu UI.
- He thong luu dung mapping user <-> connection.
- Co API read state ket noi de UI hien thi.

## 11. Output can nop

- Migration SQL cho `integration_connections`.
- Screenshot/record OAuth ket noi Gmail thanh cong.
- Log webhook auth success + 1 log reject signature sai.

## 12. Tai lieu tham khao Nango

- Implement API auth: https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth
- Auth/webhook events: https://docs.nango.dev/guides/webhooks/webhooks-from-nango
- Get connection status: https://nango.dev/docs/reference/api/connections/get
