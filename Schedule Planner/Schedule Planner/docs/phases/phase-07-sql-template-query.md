# Phase 7 - Query Data Bằng SQL Template

## 1. Mục tiêu

- Trả lời ổn định các câu hỏi thống kê phổ biến.
- Không phụ thuộc LLM sinh SQL tự do.
- Tạo lớp query an toàn và dễ kiểm thử.

## 2. Phạm vi

Trong phase này làm:

- Mapping pattern câu hỏi -> SQL template.
- Query read-only bằng parameterized SQL.
- Format trả lời chuẩn cho chatbot.

Chưa làm:

- Text-to-SQL tổng quát.

## 3. Cấu trúc code đề xuất

```text
lib/query/
  intentPatterns.js
  sqlTemplates.js
  queryExecutor.js
  responseFormatter.js
app/api/sql/query/route.js
```

## 4. Danh sách query bắt buộc v1

- Còn bao nhiêu task chưa làm hôm nay.
- Tổng giờ tuần này.
- Task ưu tiên cao chưa hoàn thành.
- Goal có nguy cơ trễ deadline.
- So sánh tuần này với tuần trước.

## 5. Template SQL mẫu

Ví dụ câu:

`Hôm nay tôi còn bao nhiêu task chưa làm?`

```sql
SELECT COUNT(*)::int AS pending_count
FROM tasks
WHERE user_id = $1
  AND date = CURRENT_DATE
  AND status <> 'done';
```

Ví dụ câu:

`Task ưu tiên cao nào chưa hoàn thành?`

```sql
SELECT id, title, date, start_time, end_time
FROM tasks
WHERE user_id = $1
  AND priority = 'high'
  AND status <> 'done'
ORDER BY date, start_time
LIMIT 20;
```

## 6. Các bước thực hành chi tiết

### Bước 1 - Pattern matching

- Dùng regex/từ khóa xác định loại query.
- Trích entity: khoảng thời gian, priority, status.

### Bước 2 - SQL template map

- Mỗi query type có SQL cố định.
- Chỉ truyền params, không nối chuỗi SQL trực tiếp.

### Bước 3 - Query executor

- Thiết kế lớp chạy query:
  - timeout
  - log duration
  - error handling

### Bước 4 - Response formatter

- Trả 2 kiểu:
  - ngắn gọn
  - có gợi ý hành động

### Bước 5 - Unit test

- Mỗi template có test input/output.
- Có test edge cases khi không có dữ liệu.

## 7. API contract đề xuất

`POST /api/sql/query`

Input:

```json
{
  "userId": "uuid",
  "text": "Tuần này tổng số giờ làm việc là bao nhiêu?"
}
```

Output:

```json
{
  "queryType": "weekly_total_hours",
  "data": { "totalHours": 21.5 },
  "summary": "Tuần này bạn có tổng 21.5 giờ làm việc."
}
```

## 8. Kiểm thử tối thiểu

- 20 query test pass.
- 0 trường hợp SQL injection do dùng params.
- Thời gian phản hồi ổn định cho query phổ biến.

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Trả sai câu hỏi | Pattern match kém | Tăng độ phủ regex + synonym |
| Query chậm | Thiếu index | Bổ sung index theo filter |
| Kết quả khó hiểu | Format text chưa tốt | Thêm response templates |

## 10. Tiêu chí hoàn thành

- Query phổ biến trả đúng và nhất quán.
- API query có contract rõ.
- Có test dataset ổn định cho regression.

## 11. Output cần nộp

- File mapping pattern-template.
- 20 test cases.
- 5 response mẫu theo tone khác nhau.
