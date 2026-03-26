# Phase 7 - Delivery Analytics SQL Templates

## 1. Muc tieu

- Co bo query read-only de quan sat hieu qua reminder da kenh.
- Ho tro chatbot/agent tra loi cau hoi van hanh ma khong can Text-to-SQL tu do.
- Tao duoc dashboard co so cho team product/ops.

## 2. Pham vi

Trong phase nay lam:

- Mapping cau hoi thong ke -> SQL template.
- API query read-only cho delivery + integration health.
- Response formatter cho dashboard/chat.

Chua lam:

- Text-to-SQL dynamic (khong can trong roadmap moi tu phase nay).

## 3. Danh sach query bat buoc v1

1. Ty le gui reminder thanh cong 7 ngay gan nhat.
2. So reminder fail theo channel.
3. So user chua ket noi kenh nao.
4. Top task bi nhac nhieu lan (retry cao).
5. Avg do tre gui reminder so voi `send_at`.

## 4. Cau truc code de xuat

```text
lib/query/
  reminderIntentPatterns.js
  reminderSqlTemplates.js
  reminderQueryExecutor.js
  reminderResponseFormatter.js
app/api/analytics/query/route.js
```

## 5. SQL template mau

### 5.1 Success rate 7 ngay

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'sent')::float / NULLIF(COUNT(*), 0) AS success_rate
FROM reminder_jobs
WHERE user_id = $1
  AND send_at >= NOW() - INTERVAL '7 days';
```

### 5.2 Fail count theo channel

```sql
SELECT integration_id, COUNT(*)::int AS failed_count
FROM reminder_jobs
WHERE user_id = $1
  AND status = 'failed'
GROUP BY integration_id
ORDER BY failed_count DESC;
```

## 6. API contract de xuat

`POST /api/analytics/query`

Input:

```json
{
  "text": "7 ngay qua reminder Gmail thanh cong bao nhieu phan tram?"
}
```

Output:

```json
{
  "queryType": "delivery_success_rate_7d",
  "data": {
    "successRate": 0.93
  },
  "summary": "7 ngay qua, reminder thanh cong 93%."
}
```

## 7. Checklist trien khai

1. Chot query types va response schema.
2. Viet SQL templates parameterized.
3. Them timeout + query duration log.
4. Them formatter cho nguyen van dashboard/chat.
5. Viet unit test cho tung template.

## 8. Kiem thu toi thieu

- 20 query test pass (gom edge case khong co du lieu).
- SQL injection test: tat ca input phai qua params.
- Query p95 latency dat muc muc tieu noi bo.

## 9. Tieu chi hoan thanh

- Team co endpoint thong ke delivery on-demand.
- Dashboard co so co the dung ngay.
- Agent co the tra loi nhom cau hoi van hanh pho bien.

## 10. Output can nop

- File mapping intent -> template.
- Bo test SQL templates.
- Dashboard screenshot cho 5 metric chinh.
