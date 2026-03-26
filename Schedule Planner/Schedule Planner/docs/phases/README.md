# Lo trinh Thuc Hanh Theo Phase (Nango-first -> OpenClaw Personal Assistant)

Tai lieu nay tach nho cac phase de trien khai tuan tu.
Bo sung moi: tu Phase 14 tro di tap trung manh vao AI workflow quality va workflow coverage.

## Thu tu de xuat

1. [Phase 0 - Chuan bi nen tang](./phase-00-foundation.md)
2. [Phase 1 - Chuan hoa schema DB](./phase-01-db-schema.md)
3. [Phase 2 - Intern Router](./phase-02-intern-router.md)
4. [Phase 3 - Workflow Engine v1](./phase-03-workflow-engine.md)
5. [Phase 4 - Nango Integration Foundation](./phase-04-priority-classifier.md)
6. [Phase 5 - Gmail Reminder Delivery](./phase-05-reminder-worker.md)
7. [Phase 6 - Telegram Reminder Channel](./phase-06-messenger-integration.md)
8. [Phase 7 - Chat Bridge Telegram <-> Agent Lab](./phase-07-chat-bridge.md)
9. [Phase 8 - Personal Memory Engine](./phase-08-personal-memory.md)
10. [Phase 9 - Personal Knowledge Vault (RAG)](./phase-09-knowledge-vault.md)
11. [Phase 10 - Proactive Planner & Recovery Workflow](./phase-10-proactive-planner.md)
12. [Phase 11 - Tool Runtime & Workflow Orchestration v2](./phase-11-tool-runtime.md)
13. [Phase 12 - Voice & Multimodal Workflow Input](./phase-12-voice-multimodal.md)
14. [Phase 13 - OpenClaw Readiness (Quality, Safety, Ops)](./phase-13-openclaw-readiness.md)
15. [Phase 14 - Workflow Coverage Expansion](./phase-14-workflow-coverage-expansion.md)
16. [Phase 15 - Reasoning & Verification Loop](./phase-15-reasoning-verification-loop.md)
17. [Phase 16 - Eval Benchmark & Guardrail](./phase-16-eval-benchmark-guardrail.md)
18. [Phase 17 - Domain Workflow Packs](./phase-17-domain-workflow-packs.md)

## Nhom phase giai bai toan "tra loi chua tot"

- Phase 14: Mo rong them nhieu workflow thuc te.
- Phase 15: Them verification loop de giam sai logic.
- Phase 16: Benchmark + guardrail de chan regression.
- Phase 17: Domain packs de bot bot tra loi chung chung.

## Nguyen tac thuc hien tu Phase 4 tro di

- Nango la lop ket noi OAuth/API ben ngoai (khong hardcode token theo tung provider).
- Moi kenh thong bao/channels duoc chuan hoa qua `integration_id` + `connection_id`.
- Telegram + Gmail la bo kenh giao tiep/reminder dau tien.
- Agent Lab la noi test nhanh route/workflow/tool truoc khi dua vao chat channel.
- Moi phase deu uu tien: safety, observability, data privacy va quality metrics.

## Cach dung bo phase nay

- Moi phase deu co: muc tieu, pham vi, checklist, KPI/tieu chi hoan thanh.
- Chi chuyen phase khi phase truoc da pass acceptance criteria.
- Moi phase nen co commit rieng de rollback nhanh.

## Goi y nhip 10-12 tuan

- Tuan 1-2: Phase 0 -> 5
- Tuan 3: Phase 6 -> 7
- Tuan 4-5: Phase 8 -> 11
- Tuan 6: Phase 12 -> 13
- Tuan 7-9: Phase 14 -> 15
- Tuan 10-12: Phase 16 -> 17

## Definition of Done cho moi phase

1. Chay duoc end-to-end tren local/dev.
2. Co test case pass cho case chinh + case loi.
3. Co log/metrics de debug va do quality.
4. Co ghi chu cach verify trong docs hoac README.
5. Co danh gia rui ro security/privacy khi phase lien quan den action tool.