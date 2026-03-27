Những thẻ HTML Telegram hỗ trợ

Bạn có thể dùng:

<b>in đậm</b>
<i>in nghiêng</i>
<u>gạch chân</u>
<s>gạch ngang</s>
<code>code inline</code>
<pre>block code</pre>
<a href="https://google.com">link</a>
❌ Những thứ KHÔNG hỗ trợ
❌ <div>, <span>
❌ CSS (style="color:red")
❌ Layout kiểu flex/grid
❌ Font, màu sắc
❌ Script

👉 Nói thẳng: Telegram không phải browser, nó chỉ parse vài tag cơ bản thôi.

📌 Ví dụ chuẩn (nên dùng)
{
  "text": "📅 <b>Tasks hôm nay</b>\n\n⏰ <b>08:30-09:30</b>\n- Đi bia\n<i>Ưu tiên: Trung bình</i>",
  "parse_mode": "HTML"
}

👉 Render sẽ khá đẹp:

Có hierarchy
Dễ đọc hơn plain text
⚠️ Lưu ý quan trọng (hay dính bug)
Phải đóng tag đầy đủ
<b>OK</b> ✅
<b>OK ❌
Escape ký tự đặc biệt
< > &

→ phải convert:

&lt; &gt; &amp;
Không lồng tag bừa:
<b><i>OK</i></b> ✅
💡 Tip thực tế (dành cho bạn)

Telegram đẹp hay không không phải do HTML, mà do:

cách bạn format text
cách bạn dùng emoji + spacing

👉 Ví dụ xịn hơn HTML đơn thuần:

📅 <b>Tasks hôm nay (11)</b>

🟡 <b>08:30-09:30</b> — 🍺 Đi bia
<i>Ưu tiên: Trung bình</i>

🟡 <b>09:30-10:30</b> — 🎮 Đi net
<i>Ưu tiên: Trung bình</i>
🔥 Kết luận
✔ Có hỗ trợ HTML
❗ Nhưng chỉ basic formatting
🚫 Không có CSS / layout
💡 Muốn đẹp → dùng emoji + spacing + structure

Nếu bạn muốn nâng level nữa, mình khuyên:
👉 chuyển sang inline keyboard + interactive UI (như app thật)

Muốn mình build luôn 1 template “Telegram Todo UI xịn” cho bạn không?