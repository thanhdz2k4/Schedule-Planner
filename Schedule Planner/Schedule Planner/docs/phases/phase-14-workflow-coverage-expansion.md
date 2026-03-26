# Phase 14 - Workflow Coverage Expansion

## 1. Muc tieu

- Giai bai toan "workflow qua it" bang bo workflow v2.
- Nang coverage intent thuc te trong chat Telegram/Agent Lab.
- Tach workflow theo capability de mo rong nhanh.

## 2. Danh sach workflow uu tien bo sung

1. `set_goal`
2. `plan_day`
3. `plan_week`
4. `reschedule_task`
5. `breakdown_goal`
6. `focus_block`
7. `meeting_prep`
8. `deadline_risk_check`
9. `follow_up_overdue`
10. `habit_review`
11. `study_plan`
12. `daily_reflection`

## 3. Pham vi

Trong phase nay lam:

- Intent taxonomy v2 + entity schema cho moi workflow moi.
- Step template tai su dung: validate, enrich, execute, summarize.
- Workflow fallback message khi thieu du lieu.

## 4. Checklist

1. Moi workflow co input contract ro rang.
2. Moi workflow co 1 happy path + 2 error path test.
3. Registry ho tro feature-flag theo workflow.
4. Co migration metric intent->workflow success.

## 5. KPI va tieu chi hoan thanh

- Coverage intent top user requests >= 80%.
- Ty le "khong xu ly duoc" giam >= 40%.
