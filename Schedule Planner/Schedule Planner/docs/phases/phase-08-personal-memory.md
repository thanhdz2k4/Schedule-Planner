# Phase 8 - Personal Memory Engine

## 1. Muc tieu

- Tang chat luong tra loi bang memory theo tung user.
- Giam tra loi chung chung khi chat nhieu luot tren Telegram/Agent Lab.
- Tao nen cho workflow de xuat theo thoi quen ca nhan.

## 2. Van de hien tai

- Cung mot user, turn sau khong nho ro preference turn truoc.
- Router/workflow khong co profile nguoi dung de mac dinh thong minh.
- Clarification question lap lai qua nhieu.

## 3. Pham vi

Trong phase nay lam:

- Memory schema theo type: `preference`, `constraint`, `habit`, `project_context`.
- Extract memory tu chat message + workflow result.
- Retrieval memory truoc khi route/execute.
- API cho user xem/sua/xoa memory.

Chua lam:

- Shared memory giua nhieu user.
- Auto-merge conflict phuc tap bang LLM nang cao.

## 4. Kien truc de xuat

```text
Inbound Message / Workflow Result
  -> Memory Extractor
  -> user_memory_facts
  -> Memory Retriever
  -> Router + Workflow Context
```

## 5. Checklist

1. Tao bang `user_memory_facts`, `memory_events`.
2. Gan confidence score + last_seen cho moi fact.
3. Inject memory vao prompt/router context.
4. Them endpoint memory CRUD theo user.
5. Log memory hit-rate moi turn.

## 6. KPI va tieu chi hoan thanh

- Ty le can clarification giam >= 20% so voi truoc phase.
- Co it nhat 3 memory type duoc su dung thuc te trong response.
- Khong leak memory giua user A/B.

## 7. Trang thai trien khai

Da trien khai:

1. Migration:
   - `db/migrations/009_user_memory_phase8.sql`
2. Query layer:
   - `lib/db/queries/userMemoryQueries.js`
3. Memory service (extract/retrieve/persist):
   - `lib/agent/memory/index.js`
4. Tich hop vao routing/workflow/chat:
   - `app/api/agent/route/route.js`
   - `app/api/agent/workflow/execute/route.js`
   - `lib/agent/chatBridge.js`
   - `lib/agent/router/index.js`
   - `lib/agent/router/llmRouter.js`
5. Memory API:
   - `GET /api/memory/facts`
   - `PUT /api/memory/facts`
   - `DELETE /api/memory/facts/{factId}`
