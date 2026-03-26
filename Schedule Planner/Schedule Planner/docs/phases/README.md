# Lo trinh Thuc Hanh Theo Phase (Nango-first, Gmail-first)

Tai lieu nay tach nho cac phase de trien khai tuan tu.
Tu Phase 4 tro di, roadmap duoc doi sang huong tich hop da nen tang thong qua Nango.

## Thu tu de xuat

1. [Phase 0 - Chuan bi nen tang](./phase-00-foundation.md)
2. [Phase 1 - Chuan hoa schema DB](./phase-01-db-schema.md)
3. [Phase 2 - Intern Router](./phase-02-intern-router.md)
4. [Phase 3 - Workflow Engine v1](./phase-03-workflow-engine.md)
5. [Phase 4 - Nango Integration Foundation](./phase-04-priority-classifier.md)
6. [Phase 5 - Gmail Reminder Delivery](./phase-05-reminder-worker.md)
7. [Phase 6 - Multi-platform Notification Expansion](./phase-06-messenger-integration.md)
8. [Phase 7 - Delivery Analytics SQL Templates](./phase-07-sql-template-query.md)
9. [Phase 8 - Channel Intelligence Engine](./phase-08-text-to-sql.md)
10. [Phase 9 - Production Hardening for Integrations](./phase-09-hardening.md)

## Nguyen tac thuc hien tu Phase 4 tro di

- Nango la lop ket noi OAuth/API ben ngoai (khong hardcode token theo tung provider).
- Moi kenh thong bao duoc chuan hoa qua `integration_id` + `connection_id`.
- Gmail la kenh dau tien de gui reminder sap den lich.
- Luong thong bao duoc thiet ke theo huong mo rong da kenh (Gmail -> Slack/Teams/...).

## Cach dung bo phase nay

- Moi phase deu co: muc tieu, pham vi, checklist, tieu chi hoan thanh, output can nop.
- Chi chuyen phase khi phase truoc da pass acceptance criteria.
- Moi phase nen co commit rieng de rollback nhanh.

## Goi y nhip 4 tuan

- Tuan 1: Phase 0, 1, 2
- Tuan 2: Phase 3, 4
- Tuan 3: Phase 5, 6
- Tuan 4: Phase 7, 8, 9

## Definition of Done cho moi phase

1. Chay duoc end-to-end tren local/dev environment.
2. Co test case pass cho case chinh + case loi.
3. Co log/metrics de debug.
4. Co ghi chu cach verify trong docs hoac README.
