# Phase 8 - Channel Intelligence Engine

## 1. Muc tieu

- Tu dong chon kenh thong bao phu hop cho tung reminder.
- Giam ti le fail va giam "noise" cho nguoi dung.
- Van dam bao minh bach ly do chon kenh (explainable decision).

## 2. Pham vi

Trong phase nay lam:

- Rule engine chon channel dua tren context.
- (Tuy chon) LLM refine score neu can.
- Logging score + reason de audit.

Chua lam:

- Tu dong thay doi policy toan he thong (chi ap dung per-user/per-job).

## 3. Input cho engine

- Task context: deadline gap, priority, work hours.
- User preference: kenh uu tien, quiet hours, mute channels.
- Channel health: success rate gan day, latency, auth status.
- Business rules: "high priority => khong duoc bo qua fallback".

## 4. Output contract

```json
{
  "selectedChannels": ["gmail", "slack"],
  "policy": "primary_with_fallback",
  "reason": "gmail healthy + user preference #1, fallback slack for urgent task",
  "scoreBreakdown": {
    "gmail": 0.82,
    "slack": 0.67
  }
}
```

## 5. Rule scoring v1 de xuat

- Channel disconnected: score = -inf
- Channel trong quiet hours: -0.4
- User preferred channel #1: +0.3
- Success rate 7d > 95%: +0.2
- Urgent task: them fallback channel bat buoc.

Mapping policy:

- score cao nhat >= threshold: primary.
- Neu task urgent hoac score sat threshold: primary + fallback.
- Neu tat ca score thap: fallback sang email va tao warning event.

## 6. Cau truc code de xuat

```text
lib/channel-intelligence/
  rules.js
  scorer.js
  selector.js
  explain.js
  evaluator.js
```

## 7. Tich hop vao worker

1. Worker nhan job pending.
2. Goi Channel Intelligence Engine lay policy.
3. Orchestrator gui theo `selectedChannels`.
4. Ghi `selection_reason` vao delivery logs.

## 8. Kiem thu toi thieu

- 30 test cases cho rules + edge cases.
- Test urgent task bat buoc co fallback.
- Test quiet hours khong gui sai kenh.
- Replay test tren du lieu 7 ngay de so sanh truoc/sau.

## 9. Metrics danh gia

- Delivery success rate (before vs after).
- Retry count trung binh/job.
- User complaint rate (neu co tracking).
- % jobs su dung fallback.

## 10. Tieu chi hoan thanh

- Engine dua ra quyet dinh nhat quan.
- Co explain ro rang cho moi quyet dinh.
- Co cai thien metric delivery so voi baseline Phase 6.

## 11. Output can nop

- Rulebook v1.
- Bao cao A/B (truoc-sau) tren tap du lieu thu nghiem.
- Dashboard selection reasons.
