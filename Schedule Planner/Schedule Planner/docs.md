# Schedule Planner - Product & Agent Architecture

## 1. Mục tiêu sản phẩm

Schedule Planner không chỉ là app quản lý lịch, mà là hệ thống có AI hỗ trợ vận hành công việc hằng ngày:

- Quản lý task theo ngày (timeline).
- Nhắc việc tự động trước 5 phút qua Messenger.
- Tự động phân loại task quan trọng/không quan trọng.
- Cho phép người dùng hỏi dữ liệu bằng ngôn ngữ tự nhiên qua Text-to-SQL.
- Dùng mô hình `intern agent` để đọc câu nói người dùng, chọn workflow phù hợp, rồi chạy theo từng step.

---

## 2. Kiến trúc tổng thể

### 2.1 Các thành phần chính

1. **Web App (Next.js)**  
   UI nhập task, xem lịch, analytics, goals, reminders.

2. **API Layer (Next.js Route Handlers)**  
   Nhận request từ UI và từ webhook Messenger.

3. **PostgreSQL**  
   Lưu task, goals, reminder jobs, kết nối Messenger, logs agent.

4. **Scheduler / Queue Worker**  
   Chạy nền để gửi nhắc việc đúng thời điểm `start_time - 5 phút`.

5. **Messenger Connector**  
   Webhook + send API để gửi tin nhắc cho user.

6. **AI Layer (LLM + Rule Engine)**  
   - Phân loại ý định người dùng (intent classification).  
   - Phân loại mức độ quan trọng task.  
   - Text-to-SQL để query dữ liệu.

7. **Workflow Engine**  
   Chạy luồng nhiều bước theo intent đã phân loại.

### 2.2 Luồng dữ liệu chính

1. User nhập task từ UI hoặc chat.
2. Intern Agent phân loại intent.
3. Workflow phù hợp được chọn và chạy theo step.
4. Task được lưu DB.
5. Worker tạo/lên lịch reminder trước 5 phút.
6. Đến thời điểm, Worker gửi tin qua Messenger.

---

## 3. Messenger reminder trước 5 phút

## 3.1 Điều kiện

- User phải liên kết tài khoản Messenger với app.
- Task phải có `date`, `start_time`, `status != done`.
- Task chưa bị hủy và reminder chưa gửi.

## 3.2 Logic reminder

**Reminder time** = `task_start_datetime - 5 phút`

Ví dụ:
- Task bắt đầu `08:00`
- Reminder gửi lúc `07:55`

## 3.3 Nội dung tin nhắn đề xuất

```text
Nhắc việc: 5 phút nữa bắt đầu task "{task_title}".
Thời gian: {start} - {end}
Ưu tiên: {priority}
```

## 3.4 Retry & reliability

- Nếu gửi lỗi: retry theo backoff (ví dụ 30s, 2m, 5m).
- Ghi `delivery_status` để audit.
- Idempotency key: tránh gửi trùng.

---

## 4. AI phân loại task quan trọng

## 4.1 Mục tiêu

Tự động gợi ý priority: `high`, `medium`, `low`.

## 4.2 Cách làm đề xuất (hybrid)

1. **Rule-based nhanh**:
   - Có từ khóa "gấp", "deadline hôm nay", "khẩn" -> tăng điểm.
   - Gần deadline (< 24h) -> tăng điểm.
   - Liên quan goal tuần chưa đạt -> tăng điểm.

2. **LLM scoring**:
   - Prompt ngắn: đánh giá mức quan trọng + lý do 1 câu.
   - Output chuẩn hóa JSON:

```json
{
  "priority": "high",
  "reason": "Task có deadline hôm nay và ảnh hưởng trực tiếp goal tuần."
}
```

3. **Final priority**:
   - Gộp rule score + LLM score.
   - Lưu vào DB cùng `priority_source` (`manual`, `rule`, `ai`).

---

## 5. Text-to-SQL để hỏi dữ liệu bằng tiếng Việt

## 5.1 Use cases

- "Hôm nay tôi còn bao nhiêu task chưa làm?"
- "Tuần này tổng số giờ làm việc là bao nhiêu?"
- "Task ưu tiên cao nào chưa hoàn thành?"

## 5.2 Pipeline an toàn

1. User question -> Intent `query_data`.
2. LLM sinh SQL từ schema đã biết.
3. **SQL Guardrail**:
   - Chỉ cho phép `SELECT`.
   - Chặn `UPDATE/DELETE/INSERT/DROP`.
   - Chặn query không có `user_id`.
4. Execute SQL read-only.
5. Trả kết quả + tóm tắt ngôn ngữ tự nhiên.

## 5.3 Ví dụ

**Question:** `Task ưu tiên cao nào chưa xong hôm nay?`

```sql
SELECT title, start_time, end_time
FROM tasks
WHERE user_id = $1
  AND date = CURRENT_DATE
  AND priority = 'high'
  AND status <> 'done'
ORDER BY start_time;
```

---

## 6. Intern Agent & Workflow Routing

## 6.1 Vai trò Intern Agent

Intern Agent = lớp phân loại câu nói người dùng thành workflow cụ thể.

Các intent cơ bản:

- `create_task`
- `update_task`
- `delete_task`
- `query_data`
- `plan_day`
- `set_goal`
- `configure_reminder`
- `connect_messenger`

## 6.2 Workflow mẫu

| Workflow | Step 1 | Step 2 | Step 3 | Step 4 |
|---|---|---|---|---|
| `create_task` | Parse thông tin | Validate time/overlap | Classify priority | Save DB + schedule reminder |
| `update_task` | Tìm task target | Validate thay đổi | Update DB | Re-schedule reminder |
| `query_data` | Text-to-SQL | Guardrail check | Execute read-only | Summarize kết quả |
| `connect_messenger` | OAuth/Webhook verify | Save token/page id | Send test message | Mark connected |

## 6.3 Contract output từ router

```json
{
  "intent": "create_task",
  "confidence": 0.92,
  "entities": {
    "title": "Họp sprint",
    "date": "2026-03-26",
    "start": "09:00",
    "end": "10:00"
  }
}
```

---

## 7. Data model đề xuất (PostgreSQL)

```sql
-- users
id UUID PK
timezone TEXT

-- tasks
id UUID PK
user_id UUID FK
title TEXT
date DATE
start_time TIME
end_time TIME
status TEXT CHECK (status IN ('todo','doing','done'))
priority TEXT CHECK (priority IN ('high','medium','low'))
priority_source TEXT

-- goals
id UUID PK
user_id UUID FK
title TEXT
target INT
deadline DATE

-- messenger_connections
id UUID PK
user_id UUID FK
platform TEXT
page_id TEXT
recipient_id TEXT
access_token TEXT (encrypted)
is_active BOOLEAN

-- reminder_jobs
id UUID PK
user_id UUID FK
task_id UUID FK
send_at TIMESTAMPTZ
status TEXT CHECK (status IN ('pending','sent','failed','canceled'))
retry_count INT DEFAULT 0

-- agent_runs
id UUID PK
user_id UUID FK
intent TEXT
input_text TEXT
output_json JSONB
created_at TIMESTAMPTZ
```

---

## 8. API contract đề xuất

- `POST /api/messenger/connect`
- `POST /api/messenger/webhook`
- `POST /api/agent/route`
- `POST /api/agent/workflow/execute`
- `POST /api/sql/query` (read-only, guardrailed)
- `POST /api/reminder/rebuild` (re-sync jobs từ tasks)

---

## 9. Workflow engine - nguyên tắc vận hành

Mỗi workflow gồm nhiều step độc lập:

- Step có `input_schema`, `output_schema`, `timeout`, `retry_policy`.
- Ghi log từng step (`started`, `success`, `failed`).
- Nếu step fail:
  - Retry nếu là lỗi tạm thời.
  - Stop + trả message rõ ràng nếu lỗi logic nghiệp vụ.

---

## 10. Roadmap triển khai

## Phase 1 - Reminder qua Messenger

- Kết nối Messenger.
- Scheduler + reminder job trước 5 phút.
- Delivery log + retry.

## Phase 2 - Intern Agent routing

- Intent classifier.
- 3 workflow đầu tiên: `create_task`, `update_task`, `query_data`.

## Phase 3 - Text-to-SQL production

- Query guardrails.
- SQL templates + schema prompt.
- Audit logs cho query AI.

## Phase 4 - Priority intelligence

- Rule + LLM hybrid scorer.
- Tự động gợi ý ưu tiên trong UI.

---

## 11. Lưu ý bảo mật

- Encrypt token Messenger.
- Không cho LLM execute SQL trực tiếp.
- SQL read-only và bắt buộc filter theo `user_id`.
- Log đầy đủ hành vi agent để truy vết.

---

## 12. Dev run (hiện tại)

- App + DB đã hỗ trợ Docker Compose.
- Chạy: `run-docker.bat`
- Nếu cổng bận:
  - `set APP_PORT=38080`
  - `set DB_PORT=55432`
  - `run-docker.bat`
- Dừng: `docker compose down`

---

## 13. Thư viện use-case hỏi đáp cho Agent

Mục này là tập mẫu câu để:

- train/đánh giá router intent,
- kiểm thử workflow,
- chuẩn hóa phản hồi của assistant.

### 13.1 Use-case tạo task (`create_task`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Thêm task học React lúc 8h sáng mai trong 2 tiếng" | create_task | create_task | Tạo task mới ngày mai 08:00-10:00 |
| "Chiều nay 3 giờ họp team 30 phút" | create_task | create_task | Parse time tự nhiên -> 15:00-15:30 |
| "Tạo task code API từ 20:00 đến 22:30" | create_task | create_task | Lưu task + validate overlap |
| "Nhắc tôi làm báo cáo lúc 7h tối" | create_task | create_task | Tạo task, default duration nếu thiếu end_time |
| "Mai tôi bận từ 9h đến 11h, ghi giúp tôi" | create_task | create_task | Tạo busy task theo khung giờ |

### 13.2 Use-case cập nhật task (`update_task`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Dời task học Spark từ 8h sang 9h" | update_task | update_task | Cập nhật start/end theo duration cũ |
| "Đổi task họp sprint thành 45 phút" | update_task | update_task | Update end_time |
| "Chuyển task đọc sách sang ngày mai" | update_task | update_task | Update date + reschedule reminder |
| "Đặt task viết báo cáo thành ưu tiên cao" | update_task | update_task | Update priority = high |
| "Đánh dấu task call khách hàng đã xong" | update_task | update_task | status -> done |

### 13.3 Use-case xóa task (`delete_task`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Xóa task học React tối nay" | delete_task | delete_task | Xóa đúng task và cancel reminder job |
| "Bỏ giúp tôi task 14:00 hôm nay" | delete_task | delete_task | Match theo thời gian + ngày |
| "Hủy cuộc họp sprint ngày mai" | delete_task | delete_task | Xóa task tương ứng |

### 13.4 Use-case lập kế hoạch nhanh (`plan_day`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Sắp lịch giúp tôi hôm nay, tôi có 3 việc: học SQL, gym, đọc sách" | plan_day | plan_day | Sinh đề xuất timeline theo block |
| "Ngày mai tôi rảnh từ 7h đến 11h, chia task deep work giúp tôi" | plan_day | plan_day | Gợi ý block + break |
| "Tối nay ưu tiên việc quan trọng, tự sắp lịch đi" | plan_day | plan_day | Chọn task priority cao trước |

### 13.5 Use-case mục tiêu tuần (`set_goal`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Tạo goal tuần này hoàn thành 5 bài Spark" | set_goal | set_goal | Thêm goal target=5 |
| "Deadline goal login là Chủ nhật" | set_goal | set_goal | Parse deadline về ngày cuối tuần |
| "Tăng mục tiêu đọc sách lên 7 buổi" | set_goal | set_goal | Update target goal |
| "Xóa goal cũ về tiếng Anh" | set_goal | set_goal | Delete goal |

### 13.6 Use-case reminder & Messenger (`configure_reminder`, `connect_messenger`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Kết nối Messenger cho tôi" | connect_messenger | connect_messenger | Trả link connect + verify |
| "Bật nhắc trước 5 phút cho mọi task" | configure_reminder | configure_reminder | Apply policy global |
| "Task nào cũng nhắc qua Messenger nhé" | configure_reminder | configure_reminder | Set channel messenger |
| "Tắt nhắc việc cuối tuần" | configure_reminder | configure_reminder | Rule calendar override |
| "Chỉ nhắc task ưu tiên cao" | configure_reminder | configure_reminder | Filter reminders by priority |

### 13.7 Use-case query dữ liệu (`query_data`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Hôm nay còn bao nhiêu task chưa làm?" | query_data | query_data | Trả số lượng + danh sách |
| "Tuần này tôi làm tổng bao nhiêu giờ?" | query_data | query_data | SUM duration tuần |
| "Task ưu tiên cao chưa xong là gì?" | query_data | query_data | SELECT by priority + status |
| "Ngày nào trong tháng tôi làm nhiều nhất?" | query_data | query_data | Top day by duration |
| "Tỷ lệ hoàn thành 7 ngày gần đây?" | query_data | query_data | Completion rate trend |
| "Goal nào có nguy cơ trễ deadline?" | query_data | query_data | Deadline near + progress thấp |
| "3 task tốn nhiều thời gian nhất tháng này" | query_data | query_data | Top N duration |
| "Khoảng giờ nào tôi hay làm việc nhất?" | query_data | query_data | Time-slot distribution |

### 13.8 Use-case AI phân loại độ quan trọng (`classify_priority`)

| Câu nói người dùng | Intent | Workflow | Kết quả mong đợi |
|---|---|---|---|
| "Task nộp báo cáo trước 10h sáng nay" | create_task | create_task + classify_priority | priority -> high |
| "Đọc tài liệu tham khảo cuối tuần" | create_task | create_task + classify_priority | priority -> low/medium |
| "Fix bug production ngay bây giờ" | create_task | create_task + classify_priority | priority -> high |
| "Lên ý tưởng blog cá nhân" | create_task | create_task + classify_priority | priority -> low |

### 13.9 Use-case mơ hồ cần hỏi lại (Clarification)

| Câu nói người dùng | Vấn đề | Câu hỏi follow-up bắt buộc |
|---|---|---|
| "Nhắc tôi họp vào chiều mai" | Thiếu giờ cụ thể | "Bạn muốn nhắc lúc mấy giờ?" |
| "Dời task họp sang thứ 2" | Có nhiều task họp | "Bạn muốn dời task họp nào? (kèm giờ)" |
| "Xóa task hôm nay" | Không rõ task nào | "Bạn muốn xóa tất cả task hôm nay hay task cụ thể?" |
| "Cho tôi xem tiến độ" | Thiếu phạm vi | "Bạn muốn xem theo ngày, tuần hay tháng?" |
| "Lên lịch giúp tôi" | Thiếu danh sách việc | "Bạn gửi các task + thời lượng dự kiến nhé." |

### 13.10 Use-case đa ý định trong một câu

| Câu nói người dùng | Intent sequence đề xuất | Ghi chú |
|---|---|---|
| "Tạo task họp 9h mai và nhắc qua Messenger trước 5 phút" | create_task -> configure_reminder | 1 câu, 2 workflow |
| "Dời task học SQL sang 8h và đánh dấu ưu tiên cao" | update_task -> update_task | 2 update actions |
| "Cho tôi biết hôm nay còn gì chưa làm rồi tự sắp lại lịch" | query_data -> plan_day | query trước, plan sau |

---

## 14. Bộ dữ liệu test nhanh cho Router Intent

### 14.1 Tập câu mẫu theo intent (mini)

- `create_task`: "Thêm task", "Tạo việc", "Lên lịch giúp tôi"
- `update_task`: "Dời task", "Đổi giờ", "Sửa task"
- `delete_task`: "Xóa task", "Hủy việc"
- `query_data`: "Bao nhiêu task", "Tổng giờ", "Tiến độ tuần"
- `set_goal`: "Tạo goal", "Đổi target goal"
- `connect_messenger`: "Kết nối Messenger", "Link Messenger"
- `configure_reminder`: "Nhắc trước 5 phút", "Bật/tắt nhắc việc"
- `plan_day`: "Sắp lịch ngày mai", "Tối ưu timeline hôm nay"

### 14.2 Nguyên tắc fallback

Khi `confidence < threshold` (ví dụ < 0.65):

1. Không execute workflow ngay.
2. Trả câu hỏi xác nhận intent.
3. Chỉ chạy workflow sau khi user xác nhận.

---

## 15. Định dạng phản hồi đề xuất cho chatbot

### 15.1 Với thao tác ghi dữ liệu

```text
Đã tạo task: {title}
Thời gian: {date} {start}-{end}
Ưu tiên: {priority}
Nhắc việc: trước 5 phút qua Messenger
```

### 15.2 Với thao tác query dữ liệu

```text
Tuần này bạn có 18 task, hoàn thành 12 task (67%).
Tổng thời gian làm việc: 21.5 giờ.
Top task ưu tiên cao chưa xong: ...
```

### 15.3 Với trường hợp cần hỏi lại

```text
Mình chưa đủ thông tin để thực hiện.
Bạn muốn {option_1} hay {option_2}?
```

---

## 16. Use-case hỏi đáp mở rộng + đáp án mẫu

Mục này tập trung cho intent `query_data` và các câu user hỏi tự nhiên.

### 16.1 Nhóm tiến độ trong ngày

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Hôm nay tôi còn bao nhiêu task chưa làm?" | Đếm task `date=today AND status!=done` | "Hôm nay bạn còn **5 task** chưa hoàn thành." | "Bạn còn **5 việc** cần xử lý hôm nay. Mình liệt kê nhanh nếu bạn muốn." |
| "Task nào hôm nay sắp tới giờ nhất?" | Task chưa done, gần `now` nhất | "Task gần nhất là **Họp sprint** lúc **14:00**." | "Việc kế tiếp: **Họp sprint (14:00-14:30)**." |
| "Hôm nay tôi đã hoàn thành bao nhiêu việc?" | Đếm `status=done` trong ngày | "Bạn đã hoàn thành **3 task** hôm nay." | "Tính đến hiện tại, bạn done **3 việc** trong ngày." |
| "Còn task ưu tiên cao nào trong hôm nay?" | Filter `priority=high`, `status!=done` | "Bạn còn **2 task ưu tiên cao**: A, B." | "Hiện còn **2 việc high priority** chưa xong hôm nay." |

### 16.2 Nhóm thống kê tuần/tháng/năm

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Tuần này tổng số giờ làm việc là bao nhiêu?" | SUM duration theo tuần hiện tại | "Tuần này bạn đã lên lịch **21.5 giờ**." | "Tổng thời lượng làm việc tuần này: **21 giờ 30 phút**." |
| "Tỷ lệ hoàn thành tuần này bao nhiêu?" | done/total theo tuần | "Completion rate tuần này là **67%** (12/18 task)." | "Bạn hoàn thành **67%** công việc tuần này." |
| "Tháng này ngày nào hiệu quả nhất?" | Ngày có tổng duration cao nhất | "Ngày hiệu quả nhất tháng này là **14/03** với **6.0 giờ**." | "Bạn làm nhiều nhất vào **14/03**, tổng **6 giờ**." |
| "Tháng này tôi có bao nhiêu task?" | COUNT task theo tháng | "Tháng này bạn có **42 task**." | "Bạn đã tạo **42 công việc** trong tháng hiện tại." |
| "Năm nay tháng nào làm nhiều nhất?" | Top month by duration | "Tháng nổi bật là **Tháng 3** với **58 giờ**." | "Bạn làm nhiều nhất vào **03/2026**." |

### 16.3 Nhóm ưu tiên và rủi ro

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Task ưu tiên cao nào chưa hoàn thành?" | `priority=high AND status!=done` | "Task high chưa xong: **Fix bug auth**, **Chuẩn bị demo**." | "Bạn còn **2 task ưu tiên cao** chưa hoàn thành." |
| "Goal nào có nguy cơ trễ deadline?" | Goal gần deadline + progress thấp | "Goal có rủi ro trễ: **Hoàn thành 5 bài Spark** (40%, còn 1 ngày)." | "Cảnh báo: **Goal Spark** đang chậm tiến độ." |
| "Việc nào bị trễ lịch?" | Task quá giờ start/end nhưng chưa done | "Có **1 task quá hạn**: **Nộp báo cáo**." | "Task đang trễ: **Nộp báo cáo** (deadline 10:00)." |
| "Task nào kéo dài nhất tuần này?" | Top duration task trong tuần | "Task dài nhất: **Code module billing** (**3.5 giờ**)." | "Việc tốn thời gian nhất tuần: **Code module billing**." |

### 16.4 Nhóm truy vấn theo khoảng thời gian

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Từ thứ 2 đến thứ 4 tôi làm bao nhiêu giờ?" | SUM duration trong range date | "Từ thứ 2 đến thứ 4: **11.0 giờ**." | "Bạn đã làm **11 giờ** trong giai đoạn thứ 2-thứ 4." |
| "Hôm qua tôi xong mấy task?" | COUNT done `date=yesterday` | "Hôm qua bạn hoàn thành **4 task**." | "Bạn done **4 việc** vào hôm qua." |
| "3 ngày gần nhất tôi có xu hướng tăng hay giảm?" | So sánh duration theo ngày | "3 ngày gần nhất xu hướng **giảm nhẹ** (6h -> 5h -> 4.5h)." | "Hiệu suất đang **giảm** trong 3 ngày qua." |
| "Tuần trước so với tuần này thế nào?" | Compare weekly metrics | "Tuần này cao hơn tuần trước **+12% thời lượng**." | "Bạn cải thiện **+12%** so với tuần trước." |

### 16.5 Nhóm lịch và phân bổ thời gian

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Khung giờ nào tôi hay làm việc nhất?" | Histogram theo hour block | "Bạn tập trung nhiều nhất ở khung **08:00-10:00**." | "Khung giờ làm việc chính của bạn là **buổi sáng 8-10h**." |
| "Ngày nào tuần này trống nhất?" | Ngày có ít tổng duration nhất | "Ngày trống nhất: **Thứ 5** (1.0 giờ)." | "Bạn còn nhiều thời gian rảnh nhất vào **Thứ 5**." |
| "Chiều nay còn bao nhiêu tiếng trống?" | Availability từ now đến end day | "Chiều nay bạn còn **3.5 giờ trống**." | "Lịch chiều còn khoảng **3 giờ 30 phút** chưa có task." |
| "Tôi có đang bị xếp lịch chồng không?" | overlap check | "Hiện có **2 cặp task bị chồng giờ**." | "Có xung đột lịch, mình có thể gợi ý dời task." |

### 16.6 Nhóm reminder & Messenger

| Câu hỏi user | SQL/Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Task nào sẽ được nhắc trong 30 phút tới?" | reminder_jobs window | "Trong 30 phút tới có **2 reminder**: A, B." | "Sắp gửi nhắc: **A (13:55)**, **B (14:20)**." |
| "Vì sao tôi chưa nhận nhắc việc?" | check messenger connection + job status | "Kênh Messenger của bạn đang **chưa kết nối**." | "Reminder job có nhưng trạng thái gửi đang **failed**." |
| "Nhắc nào gửi thất bại gần đây?" | filter `status=failed` | "Có **1 reminder failed** lúc 09:55 cho task X." | "Lần gửi lỗi gần nhất: task X, lý do token hết hạn." |

### 16.7 Nhóm câu hỏi tổng hợp (multi-metric)

| Câu hỏi user | Logic mục tiêu | Mẫu trả lời 1 | Mẫu trả lời 2 |
|---|---|---|---|
| "Tóm tắt cho tôi hôm nay" | total, done, pending, hours, next task | "Hôm nay: 8 task, done 3, còn 5, tổng 6.5 giờ. Việc kế tiếp: Họp sprint 14:00." | "Daily snapshot: 8 việc, hoàn thành 3 (37%), còn 5." |
| "Cho tôi review tuần này ngắn gọn" | weekly summary | "Tuần này bạn tạo 18 task, hoàn thành 12 (67%), tổng 21.5 giờ." | "Weekly review: hiệu suất ổn, còn 2 task high priority cần xử lý." |
| "Tôi nên ưu tiên gì tiếp theo?" | highest priority + nearest deadline | "Nên ưu tiên: **Fix bug auth** (high, deadline hôm nay)." | "Task tiếp theo khuyến nghị: **Fix bug auth**." |

### 16.8 Mẫu câu trả lời theo tone

#### A. Ngắn gọn (dashboard style)

```text
Hôm nay còn 5 task chưa hoàn thành.
```

#### B. Có số liệu + hành động gợi ý

```text
Hôm nay bạn còn 5 task chưa xong, trong đó có 2 task ưu tiên cao.
Bạn muốn mình đề xuất thứ tự xử lý không?
```

#### C. Tóm tắt + cảnh báo

```text
Tuần này bạn hoàn thành 67% (12/18 task), tổng 21.5 giờ.
Cảnh báo: còn 1 goal gần deadline nhưng mới đạt 40%.
```

### 16.9 Trường hợp không có dữ liệu

| Tình huống | Mẫu trả lời |
|---|---|
| Không có task trong ngày | "Hôm nay bạn chưa có task nào. Mình có thể giúp bạn tạo lịch nhanh." |
| Không có dữ liệu tuần/tháng | "Hiện chưa đủ dữ liệu cho giai đoạn này. Bạn có muốn xem toàn bộ lịch sử không?" |
| Query hợp lệ nhưng rỗng | "Không tìm thấy bản ghi phù hợp với điều kiện bạn vừa hỏi." |

### 16.10 Trường hợp query vượt quyền hoặc không an toàn

| Tình huống | Mẫu trả lời |
|---|---|
| User yêu cầu sửa dữ liệu qua query | "Mình chỉ hỗ trợ truy vấn đọc dữ liệu ở chế độ này. Nếu bạn muốn chỉnh sửa, mình sẽ chuyển sang workflow cập nhật." |
| SQL sinh ra vi phạm guardrail | "Mình không thể chạy truy vấn đó vì không an toàn. Bạn có thể hỏi lại theo dạng thống kê/tra cứu." |

---

## 17. Kế hoạch thực hành theo phase (hands-on)

Mục tiêu phần này là giúp bạn code theo từng đợt nhỏ, mỗi đợt có kết quả chạy được ngay.
Phiên bản tách file theo từng phase nằm tại: `docs/phases/README.md`.

### Phase 0 - Chuẩn bị nền tảng

**Mục tiêu**
- Ổn định môi trường local và Docker.
- Xác nhận app + Postgres chạy được.

**Việc cần làm**
- Chạy `run-docker.bat`.
- Kiểm tra `GET /api/planner` trả dữ liệu.
- Xác nhận dữ liệu vẫn còn sau khi restart container (nhờ volume).

**Tiêu chí hoàn thành**
- App mở được trên browser.
- DB có dữ liệu và không mất sau `docker compose down` + `up`.

**Output**
- Ảnh chụp màn hình app + response API mẫu.

### Phase 1 - Chuẩn hóa schema DB (bỏ lưu JSON-state)

**Mục tiêu**
- Chuyển từ lưu state JSON sang bảng quan hệ.

**Việc cần làm**
- Tạo thư mục `db/migrations`.
- Viết migration tạo các bảng: `users`, `tasks`, `goals`, `reminder_jobs`, `messenger_connections`, `agent_runs`.
- Viết seed dữ liệu tối thiểu.

**Tiêu chí hoàn thành**
- CRUD task/goals chạy qua bảng SQL thật.
- Không phụ thuộc vào một record JSON tổng.

**Output**
- File SQL migration + ERD đơn giản (ảnh hoặc markdown).

### Phase 2 - Intern Router (rule-based trước)

**Mục tiêu**
- Phân loại câu nói user thành intent + entity.

**Việc cần làm**
- Tạo endpoint `POST /api/agent/route`.
- Input: `text`.
- Output: `intent`, `confidence`, `entities`.
- Dùng luật/regex từ các use-case trong Section 13, 16.

**Tiêu chí hoàn thành**
- Router phân loại đúng các intent chính: `create_task`, `update_task`, `delete_task`, `query_data`.

**Output**
- Bộ test intent tối thiểu 30 câu.

### Phase 3 - Workflow Engine v1

**Mục tiêu**
- Mỗi intent chạy đúng chuỗi step riêng.

**Việc cần làm**
- Tạo endpoint `POST /api/agent/workflow/execute`.
- Dùng `switch(intent)` gọi hàm workflow:
  - `runCreateTask`
  - `runUpdateTask`
  - `runDeleteTask`
  - `runQueryData`
- Log từng step vào `agent_runs`.

**Tiêu chí hoàn thành**
- Từ 1 câu user có thể đi xuyên suốt từ router -> workflow -> DB.

**Output**
- Sequence diagram ngắn cho ít nhất 2 workflow.

### Phase 4 - Priority Classifier

**Mục tiêu**
- Tự động gán mức ưu tiên cho task.

**Việc cần làm**
- Rule score: deadline gần, từ khóa gấp, liên quan goal.
- Tùy chọn tích hợp LLM để refine.
- Lưu `priority_source` (`manual`/`rule`/`ai`).

**Tiêu chí hoàn thành**
- Tạo task mới có priority hợp lý.
- UI thể hiện màu theo priority nhất quán.

**Output**
- Bảng đánh giá 20 câu test + priority mong đợi.

### Phase 5 - Reminder Scheduler (chưa Messenger thật)

**Mục tiêu**
- Có worker gửi nhắc trước 5 phút qua mock channel.

**Việc cần làm**
- Viết worker chạy nền, poll `reminder_jobs`.
- Khi đến giờ, gửi mock message (log hoặc console).
- Retry nếu lỗi giả lập.

**Tiêu chí hoàn thành**
- Task tạo mới sinh reminder job.
- Reminder status chuyển `pending -> sent`.

**Output**
- Log demo 1 vòng đời reminder.

### Phase 6 - Kết nối Messenger thật

**Mục tiêu**
- Nhận/gửi tin nhắn qua Messenger API.

**Việc cần làm**
- `POST /api/messenger/connect`
- `POST /api/messenger/webhook`
- Lưu token encrypted.
- Send test message khi connect thành công.

**Tiêu chí hoàn thành**
- User nhận được tin nhắc thật trên Messenger.

**Output**
- Video ngắn hoặc ảnh chụp tin nhắn nhận được.

### Phase 7 - Query Data bằng SQL template

**Mục tiêu**
- Trả lời các câu hỏi thống kê phổ biến, ổn định.

**Việc cần làm**
- Map câu hỏi phổ biến -> SQL template.
- Dùng params theo `user_id`, `date range`.
- Trả lời bằng 2 format: ngắn gọn và có gợi ý hành động.

**Tiêu chí hoàn thành**
- Pass tập use-case query trong Section 16.1 -> 16.7.

**Output**
- Bảng mapping `question_pattern -> sql_template`.

### Phase 8 - Text-to-SQL có guardrail

**Mục tiêu**
- Cho phép hỏi tự do hơn nhưng vẫn an toàn.

**Việc cần làm**
- LLM sinh SQL từ schema prompt.
- Guardrail:
  - Chỉ cho phép `SELECT`.
  - Bắt buộc filter `user_id`.
  - Chặn từ khóa nguy hiểm (`drop`, `delete`, `update`, `insert`).
- Execute qua DB role read-only.

**Tiêu chí hoàn thành**
- Query tự do chạy đúng với câu hỏi mới.
- Không có lệnh phá dữ liệu.

**Output**
- Bộ test bảo mật SQL (malicious prompts).

### Phase 9 - Đánh giá, quan sát, hardening

**Mục tiêu**
- Hệ thống có thể theo dõi chất lượng và vận hành ổn định.

**Việc cần làm**
- Metrics:
  - Intent accuracy
  - Workflow success rate
  - Reminder delivery rate
  - Text-to-SQL success rate
- Log tập trung cho API/worker/agent.
- Thêm fallback khi confidence thấp.

**Tiêu chí hoàn thành**
- Có dashboard hoặc report định kỳ.
- Có quy trình xử lý lỗi rõ ràng.

**Output**
- Tài liệu vận hành (runbook) + checklist release.

---

## 18. Gợi ý nhịp thực hành 4 tuần

**Tuần 1**
- Phase 0, 1, 2

**Tuần 2**
- Phase 3, 4

**Tuần 3**
- Phase 5, 6

**Tuần 4**
- Phase 7, 8, 9

---

## 19. Definition of Done cho mỗi phase

Một phase chỉ coi là xong khi đủ 4 điều kiện:

1. Chạy được end-to-end ở local.
2. Có test case pass.
3. Có log để debug.
4. Có ghi chú ngắn trong docs về cách chạy/verify.
