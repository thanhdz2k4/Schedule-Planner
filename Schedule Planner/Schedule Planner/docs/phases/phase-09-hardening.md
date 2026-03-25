# Phase 9 - Quan Sát, Đánh Giá, Hardening

## 1. Mục tiêu

- Làm hệ thống đủ ổn định để vận hành thật.
- Đo được chất lượng theo từng lớp (router, workflow, reminder, query).
- Có runbook xử lý sự cố.

## 2. Phạm vi

Trong phase này làm:

- Metrics + dashboards.
- Structured logging + trace id.
- Cơ chế fallback và circuit breaker cơ bản.
- Runbook vận hành.

## 3. Metrics bắt buộc

### 3.1 Router/Agent

- `intent_accuracy`
- `clarification_rate`
- `avg_route_latency_ms`

### 3.2 Workflow

- `workflow_success_rate`
- `workflow_failure_by_intent`
- `avg_workflow_latency_ms`

### 3.3 Reminder

- `reminder_delivery_rate`
- `avg_reminder_delay_ms`
- `failed_reminder_count`

### 3.4 Query

- `sql_template_success_rate`
- `text2sql_guardrail_reject_rate`
- `avg_query_latency_ms`

## 4. Logging chuẩn

Mỗi request/workflow cần có:

- `trace_id`
- `user_id`
- `intent`
- `status`
- `duration_ms`
- `error_code` (nếu có)

Không log:

- access token
- secret
- raw credentials

## 5. Hardening checklist

- Retry có giới hạn, không vòng lặp vô hạn.
- Timeout cho API ngoài (Messenger/LLM/DB query).
- Idempotency cho reminder send.
- Graceful degradation:
  - Router confidence thấp -> hỏi lại.
  - Text-to-SQL fail -> fallback template query.
- Healthcheck endpoints:
  - app health
  - db connectivity
  - worker status

## 6. Runbook sự cố tối thiểu

### Incident A - Reminder không gửi

1. Kiểm tra worker còn chạy không.
2. Kiểm tra `reminder_jobs` có pending đến hạn không.
3. Kiểm tra messenger connection/token.
4. Kiểm tra log lỗi gửi và retry count.

### Incident B - Query lỗi hàng loạt

1. Kiểm tra DB timeout/chậm.
2. Kiểm tra deploy thay đổi schema.
3. Kiểm tra guardrail reject rate tăng bất thường.

### Incident C - Router phân loại sai nhiều

1. Kiểm tra dataset drift (câu user mới).
2. Kiểm tra threshold confidence.
3. Cập nhật rules hoặc retrain classifier.

## 7. Kiểm thử vận hành

- Load test nhẹ:
  - 50-100 request/phút.
- Chaos test cơ bản:
  - restart worker khi đang có pending jobs.
- Recovery test:
  - token messenger hết hạn và refresh lại.

## 8. Tiêu chí hoàn thành

- Có dashboard/biểu đồ theo dõi core metrics.
- Có runbook để on-call xử lý lỗi chính.
- Tỷ lệ thành công của các luồng chính đạt ngưỡng nội bộ.

## 9. Output cần nộp

- Runbook markdown.
- Ảnh dashboard metrics.
- Báo cáo chất lượng bản release gần nhất.
