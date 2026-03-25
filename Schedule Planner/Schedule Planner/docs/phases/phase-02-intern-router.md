# Phase 2 - Intern Router (Rule-based + LLM Adapter)

## 1. Mục tiêu

- Nhận câu nói user và phân loại đúng intent.
- Trích xuất entity đủ để workflow chạy được.
- Có cơ chế hỏi lại khi câu mơ hồ.
- Hỗ trợ **multi-turn context** để xử lý câu follow-up ngắn.
- Có thể chọn provider: `rule`, `mistral`, `auto`.

## 2. Phạm vi

Trong phase này làm:

- Router rule-based.
- Entity extraction cơ bản.
- Confidence + fallback clarification.
- Adapter gọi LLM (Mistral) cho classify intent.
- Context merge giữa turn trước và turn hiện tại.

Chưa làm:

- Workflow business logic sâu (phase 3).
- Session manager dài hạn trong DB (phase sau).

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

### 4.1 Input cơ bản

```json
{
  "userId": "uuid",
  "provider": "rule",
  "text": "Thêm task họp sprint lúc 9h sáng mai"
}
```

### 4.2 Input có context (follow-up)

```json
{
  "userId": "uuid",
  "provider": "mistral",
  "text": "kéo dài 1 tiếng, ưu tiên cao, nhắc trước 5 phút",
  "context": {
    "intent": "create_task",
    "entities": {
      "title": "họp sprint",
      "date": "2026-03-25",
      "start": "09:00"
    },
    "last_user_text": "Tạo task họp sprint ngày hôm nay lúc 9 giờ sáng",
    "last_agent_question": "Task kéo dài bao lâu? Có cần đặt mức độ ưu tiên hoặc nhắc nhở trước không?"
  }
}
```

### 4.3 Output thành công

```json
{
  "intent": "create_task",
  "confidence": 0.92,
  "entities": {
    "title": "họp sprint",
    "date": "2026-03-25",
    "start": "09:00",
    "end": "10:00",
    "duration_minutes": 60,
    "priority": "high",
    "minutes_before": 5
  },
  "need_clarification": false,
  "clarifying_question": null,
  "source": "mistral",
  "context_for_next_turn": {
    "intent": "create_task",
    "entities": {
      "title": "họp sprint",
      "date": "2026-03-25",
      "start": "09:00",
      "end": "10:00",
      "duration_minutes": 60,
      "priority": "high",
      "minutes_before": 5
    },
    "last_user_text": "kéo dài 1 tiếng, ưu tiên cao, nhắc trước 5 phút",
    "last_agent_question": null
  }
}
```

### 4.4 Output khi mơ hồ

```json
{
  "intent": "update_task",
  "confidence": 0.52,
  "entities": { "title": "họp" },
  "need_clarification": true,
  "clarifying_question": "Bạn muốn dời task họp nào? Vui lòng kèm giờ hoặc ngày.",
  "source": "rule",
  "context_for_next_turn": {
    "intent": "update_task",
    "entities": { "title": "họp" },
    "last_user_text": "Sửa task họp",
    "last_agent_question": "Bạn muốn dời task họp nào? Vui lòng kèm giờ hoặc ngày."
  }
}
```

## 5. Cấu trúc code

```text
lib/agent/router/
  intentRules.js
  entityExtractors.js
  confidence.js
  clarify.js
  llmRouter.js
  index.js
app/api/agent/route/route.js
tests/router/
  router.test.json
```

## 6. Luồng xử lý

### Bước 1 - Chọn provider

- `provider=rule` -> rule-based.
- `provider=mistral` -> bắt buộc dùng Mistral (nếu lỗi thì trả lỗi).
- `provider=auto` -> ưu tiên Mistral, lỗi thì fallback rule.

### Bước 2 - Parse turn hiện tại

- Parse `date`, `start`, `end`, `duration_minutes`, `priority`, `status`, `target`, `deadline`.

### Bước 3 - Merge context

- Merge `context.entities` với entity mới.
- Entity mới ưu tiên override entity cũ.
- Nếu có `start + duration_minutes` thì tự tính `end`.

### Bước 4 - Confidence + clarification

- Nếu thiếu field bắt buộc hoặc confidence thấp -> hỏi lại.
- Trả `context_for_next_turn` để frontend dùng ngay cho lượt tiếp theo.

### Bước 5 - Logging

- Lưu kết quả router vào `agent_runs`.

## 7. Gợi ý frontend integration

1. Gửi request `/api/agent/route`.
2. Nếu `need_clarification=true`, hiển thị `clarifying_question`.
3. User trả lời câu bổ sung.
4. Gửi request mới với `text=user_reply` + `context=context_for_next_turn`.
5. Khi `need_clarification=false` thì chuyển sang workflow execute.

## 8. Bộ test tối thiểu

- 50 câu test intent cơ bản (đã có `tests/router/router.test.json`).
- Thêm test hội thoại 2 turn cho follow-up:
  - turn 1 thiếu end.
  - turn 2 chỉ nói duration/priority/reminder.

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Follow-up bị rơi về `query_data` | Không gửi `context` | Bắt buộc gửi `context_for_next_turn` |
| Vẫn thiếu `end` sau follow-up | Không parse được duration | Bổ sung regex duration hoặc user nói rõ `đến 10h` |
| `provider=mistral` nhưng chạy rule | Thiếu/ sai `MISTRAL_API_KEY` hoặc timeout | Kiểm tra env + logs app |

## 10. Tiêu chí hoàn thành

- Router trả JSON đúng schema mới.
- Multi-turn context chạy được end-to-end.
- Có fallback rõ khi provider lỗi.

## 11. Output cần nộp

- File rules + adapter LLM.
- Dataset test.
- Demo 1 kịch bản follow-up có context.
