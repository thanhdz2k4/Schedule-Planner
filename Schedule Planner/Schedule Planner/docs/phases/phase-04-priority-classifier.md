# Phase 4 - Priority Classifier

## 1. Mục tiêu

- Tự động gán độ ưu tiên task (`high`, `medium`, `low`).
- Có thể giải thích vì sao task được xếp hạng như vậy.
- Cho phép user override thủ công.

## 2. Phạm vi

Trong phase này làm:

- Rule-based classifier.
- Lưu metadata phân loại.
- Hiển thị màu ưu tiên trên UI.

Tùy chọn nâng cao:

- Tích hợp LLM để refine score.

## 3. Thiết kế scoring rule v1

### 3.1 Điểm theo thời gian

- Deadline trong 24h: +4
- Deadline trong 48h: +2
- Quá hạn: +5

### 3.2 Điểm theo từ khóa

- Từ khóa khẩn (`gấp`, `khẩn`, `urgent`, `production`): +3
- Từ khóa thông thường (`học`, `đọc`, `tham khảo`): +1

### 3.3 Điểm theo context goal

- Liên quan goal gần deadline và progress thấp: +3
- Liên quan goal bình thường: +1

### 3.4 Mapping điểm -> priority

- `score >= 7` -> `high`
- `4 <= score <= 6` -> `medium`
- `score <= 3` -> `low`

## 4. Trường DB cần lưu thêm

Trong bảng `tasks`:

- `priority`
- `priority_source` (`manual`, `rule`, `ai`)
- `priority_reason` (text ngắn)
- `priority_score` (số)

## 5. Cấu trúc code đề xuất

```text
lib/priority/
  scoreRules.js
  classifier.js
  explain.js
```

Gợi ý interface:

```js
classifyPriority({ title, deadline, goalContext }) 
// => { priority, score, reason, source }
```

## 6. Tích hợp vào workflow

- `create_task`: nếu user không set priority, chạy classifier.
- `update_task`: nếu update title/deadline, re-score.
- Nếu user chọn tay -> `priority_source=manual`.

## 7. Hiển thị UI

- Timeline task card có màu theo priority.
- Dashboard/Reminders/Calendar cùng hệ màu.
- Badge hiển thị `Cao/Trung bình/Thấp`.

## 8. Kiểm thử tối thiểu

- 20 case với expected priority.
- Test override:
  - user set thủ công phải được giữ.
- Test consistency:
  - cùng input -> cùng output.

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Priority cao quá nhiều | Rule threshold quá thấp | Tăng ngưỡng high |
| Reason khó hiểu | Explain string quá chung | Viết template reason rõ điều kiện |
| UI lệch màu giữa các page | CSS class không thống nhất | Chuẩn hóa class `priority-*` |

## 10. Tiêu chí hoàn thành

- Task mới có priority tự động hợp lý.
- User override hoạt động.
- UI phản ánh priority đồng bộ.

## 11. Output cần nộp

- Bảng test case + kết quả.
- Thống kê accuracy nội bộ.
- Ảnh demo màu priority trên 3 màn hình.
