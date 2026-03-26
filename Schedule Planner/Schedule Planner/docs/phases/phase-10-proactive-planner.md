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
