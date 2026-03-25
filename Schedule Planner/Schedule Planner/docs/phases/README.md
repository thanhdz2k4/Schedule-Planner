# Lộ trình Thực Hành Theo Phase

Tài liệu này tách nhỏ các phase để bạn triển khai tuần tự, mỗi phase là một file độc lập.

## Thứ tự đề xuất

1. [Phase 0 - Chuẩn bị nền tảng](./phase-00-foundation.md)
2. [Phase 1 - Chuẩn hóa schema DB](./phase-01-db-schema.md)
3. [Phase 2 - Intern Router](./phase-02-intern-router.md)
4. [Phase 3 - Workflow Engine v1](./phase-03-workflow-engine.md)
5. [Phase 4 - Priority Classifier](./phase-04-priority-classifier.md)
6. [Phase 5 - Reminder Scheduler (mock)](./phase-05-reminder-worker.md)
7. [Phase 6 - Kết nối Messenger thật](./phase-06-messenger-integration.md)
8. [Phase 7 - Query bằng SQL template](./phase-07-sql-template-query.md)
9. [Phase 8 - Text-to-SQL + Guardrail](./phase-08-text-to-sql.md)
10. [Phase 9 - Quan sát, đánh giá, hardening](./phase-09-hardening.md)

## Cách dùng bộ phase này

- Mỗi phase đều có: mục tiêu, checklist thực hành, tiêu chí hoàn thành, output cần nộp.
- Chỉ chuyển phase khi phase trước đã pass tiêu chí hoàn thành.
- Mỗi phase nên có commit riêng để dễ rollback.

## Gợi ý nhịp 4 tuần

- Tuần 1: Phase 0, 1, 2
- Tuần 2: Phase 3, 4
- Tuần 3: Phase 5, 6
- Tuần 4: Phase 7, 8, 9

## Definition of Done cho mọi phase

1. Chạy được end-to-end trên local.
2. Có test case pass.
3. Có log để debug.
4. Có ghi chú cách chạy/verify trong docs hoặc README.
