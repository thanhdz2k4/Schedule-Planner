# Phase 9 - Production Hardening for Integrations

## 1. Muc tieu

- Dat muc san sang production cho luong thong bao da kenh.
- Giam rui ro van hanh khi phu thuoc API ben thu 3.
- Co runbook ro rang cho auth, webhook, delivery incidents.

## 2. Pham vi

Trong phase nay lam:

- Observability cho Nango + reminder worker + channel adapters.
- Bao mat secret, webhook verification, rotation.
- Incident response va SLO/SLA noi bo.

## 3. Metrics bat buoc

### 3.1 Integration/Auth

- `connection_active_rate`
- `reconnect_required_count`
- `auth_webhook_failure_rate`

### 3.2 Reminder Delivery

- `delivery_success_rate_by_channel`
- `delivery_latency_ms_p50/p95`
- `fallback_usage_rate`
- `retry_exhausted_count`

### 3.3 Reliability

- `worker_uptime`
- `queue_backlog`
- `dead_letter_count` (neu co)

## 4. Logging va tracing

Moi send attempt can co:

- `trace_id`
- `job_id`
- `user_id`
- `channel`
- `integration_id`
- `connection_id` (masked)
- `status`
- `duration_ms`
- `error_code`

Cam ky:

- Log token, refresh token, raw credentials.

## 5. Hardening checklist

1. Verify webhook signature 100% request.
2. Secret rotation process cho Nango keys.
3. Circuit breaker theo channel khi provider outage.
4. Timeout + retry theo loai loi.
5. Dead-letter strategy cho jobs fail lau.
6. Backfill/replay command cho jobs that bai co kiem soat.

## 6. Runbook su co toi thieu

### Incident A - OAuth ket noi fail hang loat

1. Kiem tra Nango status + API logs.
2. Kiem tra callback/cors settings.
3. Kiem tra secret key va environment mismatch.
4. Bat che do degrade: tam dung connect moi neu can.

### Incident B - Webhook auth khong vao

1. Kiem tra endpoint availability.
2. Kiem tra signature validation.
3. Kiem tra firewall/proxy settings.
4. Replay event neu co co che.

### Incident C - Delivery fail theo 1 channel

1. Xac dinh channel adapter gap loi.
2. Bat fallback channel cho user anh huong.
3. Danh dau connection status `error`.
4. Gui canh bao reconnect den user.

## 7. Kiem thu van hanh

- Load test: 100-300 reminder/phut (theo target).
- Chaos test:
  - restart worker khi backlog lon
  - mock provider timeout 30%
- Recovery test:
  - reconnect flow sau khi token revoked
  - replay dead-letter jobs

## 8. SLO de xuat

- Reminder send dung han (<= 60s sau `send_at`): >= 99%.
- Delivery success rate tong: >= 97%.
- Auth reconnect thoi gian phuc hoi trung binh: < 30 phut.

## 9. Tieu chi hoan thanh

- Co dashboard metrics va alert cho nhom chi so chinh.
- Co runbook + on-call checklist ap dung duoc.
- Co bao cao reliability cho release candidate.

## 10. Output can nop

- Runbook markdown ban chinh thuc.
- Dashboard screenshot + nguong alert.
- Bao cao post-mortem mau cho 1 su co gia lap.
