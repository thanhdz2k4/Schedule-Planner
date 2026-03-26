# Phase 10 - Proactive Planner & Recovery Workflow

## 1. Muc tieu

- Chuyen tu "tra loi theo cau hoi" sang "chu dong de xuat hanh dong".
- Bo sung workflow phuc hoi ke hoach khi lich bi vo.
- Tang gia tri chat bot thanh tro ly planning thuc su.

## 2. Van de hien tai

- Bot chi phan hoi passively, it de xuat next best action.
- Khong co workflow "reschedule cascade" khi task delay.
- Khong co daily/weekly plan generation on dinh.

## 3. Pham vi

Trong phase nay lam:

- Workflow `plan_day`, `plan_week`, `reschedule_chain`, `detect_risk`.
- Rule uu tien theo deadline + energy + focus window.
- Approval mode cho action co tac dong lon.
- Daily digest va conflict alert scheduler.

Chua lam:

- Tu dong hoa full autonomy khong co policy gate.

## 4. Kien truc de xuat

```text
Trigger (time/event/chat)
  -> Planner Graph
  -> Risk Detector
  -> Action Proposal
  -> Execute / Ask Approval
```

## 5. Checklist

1. Tao action graph model trong workflow-engine.
2. Them conflict-resolution step library.
3. Luu `assistant_actions` + approval status.
4. Them summary message template da kenh.
5. Theo doi success-rate cua de xuat.

## 6. KPI va tieu chi hoan thanh

- >= 30% user sessions co proactive suggestion huu ich.
- Ty le "plan rescue success" dat target da dat.
- User co the deny/approve action ro rang.

## 7. Trang thai trien khai

Da trien khai:

1. Migration:
   - `db/migrations/010_proactive_planner_phase10.sql`
2. Query layer:
   - `lib/db/queries/assistantPolicyQueries.js`
   - `lib/db/queries/assistantActionQueries.js`
3. Workflow intents:
   - `plan_day`
   - `plan_week`
   - `detect_risk`
   - `reschedule_chain`
4. Proactive scheduler + execution service:
   - `worker/proactiveWorker.js`
   - `lib/proactive/proposalBuilder.js`
   - `lib/proactive/actionService.js`
5. API cho phase 10:
   - `POST /api/proactive/dispatch`
   - `GET /api/proactive/actions`
   - `POST /api/proactive/actions/{actionId}/decision`
   - `GET /api/proactive/policies`
   - `PUT /api/proactive/policies`
6. UI thao tac phase 10:
   - `app/proactive/page.js`

Ghi chu:

- `reschedule_chain` da duoc execute thuc su tren `tasks` sau khi approve.
- Action policy `auto/ask/deny` duoc ap dung theo tung `action_type`.
