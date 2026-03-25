# Phase 5 - Reminder Scheduler (Mock Channel)

## 1. Mục tiêu

- Tự động gửi nhắc việc trước 5 phút.
- Chạy worker ổn định với retry có giới hạn.
- Chưa phụ thuộc Messenger thật (gửi mock trước).

## 2. Phạm vi

Trong phase này làm:

- Tạo `reminder_jobs` lifecycle.
- Tạo worker poll/dispatch.
- Mock sender để xác nhận luồng.

Chưa làm:

- Gửi qua Messenger API thật.

## 3. Luồng reminder chuẩn

1. Task create/update -> tính `send_at = start_time - 5 phút`.
2. Upsert job `pending`.
3. Worker poll job đến hạn.
4. Gửi message qua mock sender.
5. Thành công -> `sent`; lỗi -> retry hoặc `failed`.

## 4. Trạng thái job đề xuất

- `pending`
- `processing`
- `sent`
- `failed`
- `canceled`

## 5. Cấu trúc code đề xuất

```text
worker/
  reminderWorker.js
lib/reminder/
  scheduler.js
  senderMock.js
  retryPolicy.js
```

## 6. Các bước thực hành chi tiết

### Bước 1 - Upsert reminder job

- Tại workflow task create/update:
  - Tính `send_at`.
  - Upsert job theo `task_id`.

### Bước 2 - Polling worker

- Chu kỳ 15-30 giây.
- Query:
  - `status='pending'`
  - `send_at <= now()`
  - `retry_count < max_retry`

### Bước 3 - Dispatch logic

- Đặt trạng thái tạm `processing`.
- Gọi `senderMock.send()`.
- Thành công -> `sent`, set `sent_at`.
- Lỗi -> tăng `retry_count`, set `next_retry_at`.

### Bước 4 - Retry policy

Ví dụ:

- Lần 1: +30s
- Lần 2: +120s
- Lần 3: +300s
- Quá ngưỡng: `failed`

### Bước 5 - Idempotency

- Dùng `reminder_job.id` làm idempotency key.
- Worker không gửi lại nếu đã `sent`.

## 7. Kiểm thử tối thiểu

- Case thành công:
  - task bắt đầu sau 6 phút -> job gửi đúng.
- Case lỗi:
  - mock sender fail 2 lần -> retry -> sent/fail theo policy.
- Case cancel:
  - xóa task -> job `canceled`.

## 8. Quan sát hệ thống

Log mỗi lần worker chạy:

- số job quét được
- số job gửi thành công
- số job thất bại
- thời gian xử lý batch

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Gửi trễ | Poll interval quá dài | Giảm interval hoặc dùng queue |
| Gửi trùng | Thiếu idempotency | Khóa theo `job_id` + status check |
| Job không tạo | Workflow task không gọi scheduler | Bổ sung hook bắt buộc |

## 10. Tiêu chí hoàn thành

- Reminder job sinh ra đúng khi tạo/cập nhật task.
- Worker gửi đúng trước 5 phút (trong sai số chấp nhận được).
- Retry chạy đúng policy.

## 11. Output cần nộp

- Log vòng đời 1 job success.
- Log 1 case retry.
- Ảnh/chứng cứ job status trong DB.
