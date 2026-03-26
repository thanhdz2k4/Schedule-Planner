# Phase 11 - Tool Runtime & Workflow Orchestration v2

## 1. Muc tieu

- Tang so luong workflow co the thuc thi duoc thay vi chi tra loi text.
- Cho phep workflow goi nhieu tool theo chuoi an toan.
- Chuan hoa precondition/validation truoc khi action.

## 2. Van de hien tai

- Tool call con roi rac va kho debug.
- Chua co idempotency + rollback strategy ro rang.
- Workflow da buoc de bi vo neu mot step fail.

## 3. Pham vi

Trong phase nay lam:

- Tool registry chung (`schema`, `capability`, `risk_level`).
- Executor support timeout/retry/circuit-breaker.
- Pre-check step: auth, permission, required fields.
- Compensation step cho workflow co side-effect.

Chua lam:

- Marketplace cong khai plugin/tool.

## 4. Kien truc de xuat

```text
Intent
  -> Workflow Planner
  -> Tool Resolver
  -> Tool Executor
  -> Result Validator
  -> Final Composer
```

## 5. Checklist

1. Chuan hoa input/output schema cho moi tool.
2. Add idempotency key cho action tool.
3. Add structured trace id per workflow run.
4. Build retry policy theo tool class.
5. Them fallback branch khi tool hard-fail.

## 6. KPI va tieu chi hoan thanh

- Ty le workflow da tool thanh cong tang ro rang.
- Mean time to debug run loi giam >= 30%.
- Khong co duplicate side-effect o case retry.
