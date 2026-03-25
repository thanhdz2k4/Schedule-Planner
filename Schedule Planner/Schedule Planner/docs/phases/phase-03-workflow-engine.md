# Phase 3 - Workflow Engine v1

## 1. Mục tiêu

- Thực thi workflow đúng theo intent từ router.
- Tách step rõ ràng để dễ debug và mở rộng.
- Có log run-level và step-level.

## 2. Phạm vi

Trong phase này làm:

- Workflow engine core.
- 4 workflow chính:
  - `create_task`
  - `update_task`
  - `delete_task`
  - `query_data` (bản đơn giản)

Chưa làm:

- Text-to-SQL nâng cao.
- Messenger integration.

## 3. Thiết kế engine v1

### 3.1 Khái niệm

- `Workflow`: tập các step theo intent.
- `Step`: hàm có input/output rõ ràng.
- `Context`: dữ liệu chạy xuyên suốt workflow.

### 3.2 Interface đề xuất

```js
async function executeWorkflow({ userId, intent, entities, text }) {
  // return { ok, intent, result, logs, error? }
}
```

## 4. Cấu trúc code đề xuất

```text
lib/agent/workflow-engine/
  index.js
  registry.js
  steps/
    validateInput.js
    checkOverlap.js
    saveTask.js
    formatReply.js
  workflows/
    createTaskWorkflow.js
    updateTaskWorkflow.js
    deleteTaskWorkflow.js
    queryDataWorkflow.js
app/api/agent/workflow/execute/route.js
```

## 5. Flow từng workflow

### 5.1 `create_task`

1. Validate fields (`title`, `date`, `start`, `end`).
2. Check overlap.
3. Save task.
4. (Optional) enqueue reminder job.
5. Format response.

### 5.2 `update_task`

1. Resolve task target.
2. Validate patch.
3. Check overlap sau khi sửa.
4. Update DB.
5. Rebuild reminder job.

### 5.3 `delete_task`

1. Resolve task target.
2. Delete task.
3. Cancel reminder job liên quan.
4. Format response.

### 5.4 `query_data` v1

1. Map query type từ entities/router.
2. Chạy SQL template.
3. Format summary text.

## 6. Log và trace

Lưu vào `agent_runs`:

- `intent`
- `input_text`
- `status` (`started`, `success`, `failed`)
- `output_json`
- `error_message`
- `duration_ms`

## 7. Error handling

- Lỗi business (overlap, thiếu data): trả 4xx + message rõ.
- Lỗi system (DB timeout): trả 5xx + mã lỗi nội bộ.
- Không nuốt lỗi im lặng.

## 8. Kiểm thử tối thiểu

- 1 test success + 1 test fail cho mỗi workflow.
- Test integration route `/api/agent/workflow/execute`.
- Test idempotency cho request lặp lại (nếu có).

## 9. Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Workflow chạy sai intent | Router trả sai hoặc engine không validate | Verify `intent` trước execute |
| Step fail nhưng không có log | Thiếu logging wrapper | Bọc step bằng middleware log |
| Update task không rebuild reminder | Thiếu hook sau update | Thêm step post-update bắt buộc |

## 10. Tiêu chí hoàn thành

- 4 workflow chạy end-to-end.
- Có log step-level và run-level.
- Error response nhất quán.

## 11. Output cần nộp

- Sequence diagram 2 workflow.
- Log mẫu success/fail.
- Danh sách API contract đã chốt.
