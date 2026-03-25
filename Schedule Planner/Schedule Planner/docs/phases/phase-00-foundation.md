# Phase 0 - Chuẩn Bị Nền Tảng

## 1. Mục tiêu

- Chạy được app + database bằng Docker Compose.
- Xác minh dữ liệu lưu bền qua volume.
- Chốt quy chuẩn môi trường để cả team chạy giống nhau.

## 2. Phạm vi

Trong phase này chỉ làm:

- Build và chạy stack.
- Verify API, verify persistence.
- Chốt file `.env` mẫu.

Không làm trong phase này:

- Tối ưu schema.
- Tích hợp AI/agent.
- Tích hợp Messenger thật.

## 3. Chuẩn bị trước khi chạy

### 3.1 Cài đặt bắt buộc

- Docker Desktop mới.
- Node.js 20+ (dùng để chạy test local nếu cần).
- Git.

### 3.2 Kiểm tra nhanh

```powershell
docker --version
docker compose version
```

## 4. Các bước thực hành chi tiết

### Bước 1 - Chạy stack

```bat
run-docker.bat
```

Nếu cổng bận:

```bat
set APP_PORT=38080
set DB_PORT=55432
run-docker.bat
```

### Bước 2 - Verify API hoạt động

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/planner" -Method GET | ConvertTo-Json -Depth 6
```

Kết quả mong đợi:

- API trả JSON hợp lệ.
- Có đủ `tasks`, `goals`.

### Bước 3 - Verify app hoạt động

- Mở browser vào trang app.
- Thêm 1 task mới.
- Chỉnh trạng thái task.

### Bước 4 - Verify persistence

```powershell
docker compose down
docker compose up -d
```

Sau đó:

- Mở lại app.
- Kiểm tra task vừa tạo vẫn còn.

## 5. File nên có sau phase này

- `docker-compose.yml` chạy ổn định.
- `run-docker.bat` hỗ trợ cổng tùy biến.
- `docs.md` có phần run guide cơ bản.

## 6. Kiểm thử tối thiểu

1. API `GET /api/planner` trả 200.
2. API `PUT /api/planner` ghi dữ liệu thành công.
3. Restart stack không mất dữ liệu.

## 7. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `port is already allocated` | Cổng 3000 hoặc 5432 bị chiếm | Dùng `APP_PORT`, `DB_PORT` khác |
| API 500 khi gọi DB | `DATABASE_URL` sai hoặc DB chưa ready | Kiểm tra env + healthcheck |
| Dữ liệu mất sau restart | Chưa mount volume | Kiểm tra `planner_db_data` trong compose |

## 8. Tiêu chí hoàn thành

- Stack chạy được bằng 1 lệnh.
- API và UI đều hoạt động.
- Dữ liệu bền sau restart container.

## 9. Output cần nộp

- 1 ảnh app đang chạy.
- 1 output API mẫu.
- Ghi chú cổng đang dùng và cách chạy lại.
