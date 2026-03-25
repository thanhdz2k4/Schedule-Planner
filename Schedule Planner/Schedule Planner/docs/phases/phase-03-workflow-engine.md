# Phase 3 - Workflow Engine v1

## 1. Muc tieu

- Thuc thi workflow theo intent da route.
- Tach step ro rang de debug va mo rong.
- Co run-level log + step-level log.
- Ho tro 4 workflow chinh:
  - `create_task`
  - `update_task`
  - `delete_task`
  - `query_data` (ban SQL template don gian)

## 2. Pham vi da implement

Da lam:

- Core engine: runner + step logging + error mapping.
- Workflow registry va 4 workflow.
- API execute:
  - `POST /api/agent/workflow/execute`
- Logging cho `agent_runs`:
  - `run_type`
  - `status`
  - `output_json`
  - `error_message`
  - `duration_ms`
  - `step_logs`

Chua lam trong phase nay:

- Text-to-SQL nang cao.
- Messenger workflow.

## 3. Cau truc code

```text
lib/agent/workflow-engine/
  index.js
  registry.js
  errors.js
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
db/migrations/003_agent_runs_workflow_columns.sql
tests/workflow/workflow.test.json
```

## 4. API contract

### 4.1 Request

Co 2 cach:

1. Route + execute (gui `text`):

```json
{
  "userId": "00000000-0000-0000-0000-000000000001",
  "provider": "auto",
  "text": "Tao task hop sprint ngay mai tu 09:00 den 10:00"
}
```

2. Execute truc tiep (gui `intent` + `entities`):

```json
{
  "userId": "00000000-0000-0000-0000-000000000001",
  "intent": "create_task",
  "entities": {
    "title": "hop sprint",
    "date": "2026-03-26",
    "start": "09:00",
    "end": "10:00",
    "priority": "high",
    "minutes_before": 5
  }
}
```

### 4.2 Response success

```json
{
  "ok": true,
  "route": {
    "intent": "create_task",
    "entities": { "...": "..." },
    "need_clarification": false
  },
  "execution": {
    "ok": true,
    "intent": "create_task",
    "result": {
      "message": "Created task ...",
      "task": { "...": "..." },
      "reminder": { "...": "..." }
    },
    "logs": [
      { "step": "validate_input", "status": "success" },
      { "step": "check_overlap", "status": "success" },
      { "step": "save_task", "status": "success" },
      { "step": "schedule_reminder", "status": "success" },
      { "step": "format_reply", "status": "success" }
    ],
    "run_id": "uuid",
    "duration_ms": 42
  }
}
```

### 4.3 Response clarification (routing stage)

```json
{
  "ok": false,
  "stage": "routing",
  "route": {
    "need_clarification": true,
    "clarifying_question": "..."
  }
}
```

### 4.4 Response business fail

- HTTP 4xx
- `execution.error.type = "business"`

```json
{
  "ok": false,
  "stage": "workflow",
  "execution": {
    "ok": false,
    "error": {
      "type": "business",
      "code": "TASK_TIME_OVERLAP",
      "status": 409,
      "message": "Task time overlaps with an existing task."
    }
  }
}
```

## 5. Flow tung workflow

### 5.1 create_task

1. `validate_input`
2. `check_overlap`
3. `save_task`
4. `schedule_reminder` (neu co `minutes_before`)
5. `format_reply`

### 5.2 update_task

1. `resolve_task_target`
2. `validate_patch`
3. `check_overlap` (neu co doi date/start/end)
4. `save_task`
5. `rebuild_reminder_job`
6. `format_reply`

### 5.3 delete_task

1. `resolve_task_target`
2. `cancel_reminder_jobs`
3. `delete_task`
4. `format_reply`

### 5.4 query_data v1

1. `resolve_query_type`
2. `run_query` (SQL template)
3. `format_reply`

Query type da support:

- `today_unfinished_count`
- `week_total_hours`
- `high_priority_open`
- `today_task_list`
- `today_summary`

## 6. Migration schema

File: `db/migrations/003_agent_runs_workflow_columns.sql`

Bo sung cot:

- `run_type TEXT NOT NULL DEFAULT 'route'`
- `error_message TEXT NULL`
- `duration_ms INT NULL`
- `step_logs JSONB NULL`

## 7. Test checklist

1. Tao task thanh cong.
2. Tao task trung gio -> fail overlap.
3. Update task thanh cong.
4. Delete task thanh cong.
5. Query data thanh cong.

Bo scenario mau:

- `tests/workflow/workflow.test.json`

## 8. Tich hop voi Phase 2

Phase 2 (`/api/agent/route`) van giu rieng de test router.
Phase 3 (`/api/agent/workflow/execute`) se:

1. route (neu can),
2. neu `need_clarification=true` thi dung tai routing,
3. neu du data thi execute workflow.
