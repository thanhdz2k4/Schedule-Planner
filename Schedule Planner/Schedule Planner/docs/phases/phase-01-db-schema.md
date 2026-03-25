# Phase 1 - Chuẩn Hóa Schema DB

## 1. Mục tiêu

- Chuyển từ lưu JSON state sang schema quan hệ.
- Tạo nền vững cho workflow, reminder, analytics và text-to-sql.

## 2. Phạm vi

Trong phase này làm:

- Thiết kế schema chuẩn.
- Viết migration + seed.
- Cập nhật DB access layer dùng bảng quan hệ.

Chưa làm:

- Router intent.
- Workflow engine đầy đủ.
- LLM/text-to-sql.

## 3. Cấu trúc thư mục đề xuất

```text
db/
  migrations/
    001_init.sql
    002_indexes.sql
  seeds/
    001_seed_dev.sql
lib/
  db/
    client.js
    queries/
      taskQueries.js
      goalQueries.js
```

## 4. Bảng tối thiểu cần có

### 4.1 `users`

- `id` UUID PK
- `timezone` TEXT (ví dụ `Asia/Ho_Chi_Minh`)
- `created_at`, `updated_at`

### 4.2 `tasks`

- `id` UUID PK
- `user_id` UUID FK -> users
- `title` TEXT NOT NULL
- `date` DATE NOT NULL
- `start_time` TIME NOT NULL
- `end_time` TIME NOT NULL
- `status` CHECK (`todo`, `doing`, `done`)
- `priority` CHECK (`high`, `medium`, `low`)
- `priority_source` TEXT (`manual`, `rule`, `ai`)
- `goal_id` UUID NULL FK -> goals
- `created_at`, `updated_at`

### 4.3 `goals`

- `id` UUID PK
- `user_id` UUID FK
- `title` TEXT NOT NULL
- `target` INT NOT NULL
- `deadline` DATE NOT NULL
- `created_at`, `updated_at`

### 4.4 `reminder_jobs`

- `id` UUID PK
- `user_id` UUID FK
- `task_id` UUID FK
- `send_at` TIMESTAMPTZ NOT NULL
- `status` CHECK (`pending`, `sent`, `failed`, `canceled`)
- `retry_count` INT DEFAULT 0
- `last_error` TEXT NULL
- `sent_at` TIMESTAMPTZ NULL

### 4.5 `messenger_connections`

- `id` UUID PK
- `user_id` UUID FK
- `platform` TEXT DEFAULT `messenger`
- `page_id` TEXT
- `recipient_id` TEXT
- `access_token_encrypted` TEXT
- `is_active` BOOLEAN DEFAULT true
- `connected_at`, `updated_at`

### 4.6 `agent_runs`

- `id` UUID PK
- `user_id` UUID FK
- `intent` TEXT
- `input_text` TEXT
- `output_json` JSONB
- `status` TEXT
- `created_at`

## 5. Index bắt buộc

- `tasks(user_id, date)`
- `tasks(user_id, status, priority)`
- `goals(user_id, deadline)`
- `reminder_jobs(status, send_at)`
- `agent_runs(user_id, created_at DESC)`

## 6. Các bước thực hành chi tiết

### Bước 1 - Viết migration khởi tạo

- Tạo `001_init.sql` cho bảng + constraints.
- Dùng transaction để rollback nếu lỗi.

### Bước 2 - Viết migration index

- Tạo `002_indexes.sql`.
- Đảm bảo index bám các query thực tế.

### Bước 3 - Seed dữ liệu dev

- 1 user mẫu.
- 5-10 task mẫu.
- 2-3 goals mẫu.

### Bước 4 - Cập nhật layer DB

- Thay logic đọc/ghi JSON thành query SQL.
- Viết hàm CRUD rõ ràng theo module.

### Bước 5 - Chuyển API hiện tại sang schema mới

- `GET /api/planner` đọc từ bảng.
- `PUT /api/planner` mapping vào bảng (hoặc viết API CRUD mới nếu cần).

## 7. Query verify mẫu

```sql
SELECT COUNT(*) FROM tasks WHERE user_id = $1;
SELECT COUNT(*) FROM goals WHERE user_id = $1;
SELECT * FROM reminder_jobs WHERE status = 'pending' ORDER BY send_at LIMIT 5;
```

## 8. Kiểm thử tối thiểu

1. Tạo task -> có record trong `tasks`.
2. Xóa goal -> task liên quan được unlink hợp lệ.
3. Query dashboard đọc đúng số liệu từ SQL.

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| FK fail khi insert task | `user_id` hoặc `goal_id` không tồn tại | Tạo user trước, validate input |
| Query chậm | Thiếu index | Thêm index theo pattern query |
| Timezone lệch giờ | Lưu time/date sai chuẩn | Chuẩn hóa timezone ngay từ input |

## 10. Tiêu chí hoàn thành

- CRUD task/goals chạy hoàn toàn trên bảng SQL.
- Query analytics cơ bản trả đúng.
- Không còn phụ thuộc bản ghi JSON tổng.

## 11. Output cần nộp

- Migration SQL.
- Seed script.
- ERD ngắn.
- Danh sách query chính đang dùng.
