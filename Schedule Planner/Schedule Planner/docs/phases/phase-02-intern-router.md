# Phase 2 - Intern Router (Rule-based Trước)

## 1. Mục tiêu

- Nhận câu nói user và phân loại đúng intent.
- Trích xuất entity đủ để workflow chạy được.
- Có cơ chế hỏi lại khi câu mơ hồ.

## 2. Phạm vi

Trong phase này làm:

- Router rule-based.
- Entity extraction cơ bản.
- Confidence + fallback clarification.

Chưa làm:

- LLM classification.
- Workflow thực thi business logic sâu.

## 3. Danh sách intent v1

- `create_task`
- `update_task`
- `delete_task`
- `query_data`
- `set_goal`
- `plan_day`
- `configure_reminder`
- `connect_messenger`

## 4. Input/Output contract

### Input

```json
{
  "userId": "uuid",
  "text": "Thêm task họp sprint lúc 9h sáng mai"
}
```

### Output

```json
{
  "intent": "create_task",
  "confidence": 0.91,
  "entities": {
    "title": "họp sprint",
    "date": "2026-03-26",
    "start": "09:00",
    "end": "10:00"
  },
  "need_clarification": false,
  "clarifying_question": null
}
```

### Output khi mơ hồ

```json
{
  "intent": "update_task",
  "confidence": 0.52,
  "entities": { "title": "họp" },
  "need_clarification": true,
  "clarifying_question": "Bạn muốn dời task họp nào? Vui lòng kèm giờ hoặc ngày."
}
```

## 5. Cấu trúc code đề xuất

```text
lib/agent/router/
  intentRules.js
  entityExtractors.js
  confidence.js
  clarify.js
  index.js
app/api/agent/route/route.js
tests/router/
  router.test.json
```

## 6. Các bước thực hành chi tiết

### Bước 1 - Intent rule engine

- Mỗi intent có danh sách pattern.
- Match theo từ khóa + ngữ cảnh thời gian.

### Bước 2 - Entity extractor

- Parse:
  - `date`, `start`, `end`
  - `title`
  - `priority`
  - `status`
- Nếu thiếu dữ liệu bắt buộc -> đánh dấu cần hỏi lại.

### Bước 3 - Confidence score

- Điểm theo số pattern match + số entity parse được.
- Có threshold ví dụ:
  - `>= 0.65`: execute.
  - `< 0.65`: clarify.

### Bước 4 - Clarification strategy

- Tạo câu hỏi follow-up theo intent.
- Không gọi workflow khi chưa rõ dữ liệu.

### Bước 5 - Logging

- Lưu router result vào `agent_runs` hoặc log file.

## 7. Bộ test tối thiểu

- 50 câu test:
  - mỗi intent >= 5 câu
  - câu mơ hồ >= 8 câu
  - câu đa ý định >= 5 câu

Ví dụ dataset fields:

- `text`
- `expected_intent`
- `expected_entities` (một phần)
- `should_clarify`

## 8. Kiểm thử chất lượng

- Accuracy theo intent.
- Clarification precision:
  - có thật sự thiếu dữ liệu mới hỏi lại.

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Nhầm `query_data` thành `create_task` | Pattern quá rộng | Tách rule theo động từ chính |
| Parse giờ sai | Regex không cover dạng tự nhiên | Bổ sung parser cho "chiều", "tối", "mai" |
| Hỏi lại quá nhiều | Threshold quá cao | Hiệu chỉnh confidence |

## 10. Tiêu chí hoàn thành

- Router trả JSON đúng schema.
- Pass bộ test nội bộ.
- Có fallback rõ khi confidence thấp.

## 11. Output cần nộp

- File rules.
- Dataset test.
- Báo cáo accuracy ngắn.
