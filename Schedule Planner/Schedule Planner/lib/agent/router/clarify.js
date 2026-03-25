export function buildClarificationQuestion({ intent, missingFields }) {
  const missing = new Set(missingFields || []);

  if (intent === "create_task") {
    if (missing.has("title")) {
      return "Bạn muốn tạo task nào? Vui lòng mô tả tên công việc.";
    }
    if (missing.has("date")) {
      return "Bạn muốn làm task này vào ngày nào? (ví dụ: hôm nay, ngày mai, 28/03)";
    }
    if (missing.has("start")) {
      return "Bạn muốn bắt đầu task lúc mấy giờ?";
    }
    if (missing.has("end")) {
      return "Bạn muốn task kết thúc lúc mấy giờ?";
    }
    return "Bạn có thể bổ sung thêm tên task và mốc thời gian được không?";
  }

  if (intent === "update_task") {
    if (missing.has("title")) {
      return "Bạn muốn sửa task nào? Vui lòng nói rõ tên task.";
    }
    if (missing.has("patch")) {
      return "Bạn muốn cập nhật gì cho task này? (giờ, ngày, ưu tiên, trạng thái)";
    }
    return "Bạn có thể nói rõ phần cần sửa cho task này không?";
  }

  if (intent === "delete_task") {
    return "Bạn muốn xóa task nào? Vui lòng nói rõ tên task cần xóa.";
  }

  if (intent === "set_goal") {
    if (missing.has("title")) {
      return "Bạn muốn đặt mục tiêu cho nội dung nào?";
    }
    if (missing.has("target")) {
      return "Bạn muốn đặt target bao nhiêu (ví dụ: 5 task)?";
    }
    return "Bạn có thể bổ sung target cụ thể cho goal này không?";
  }

  if (intent === "configure_reminder") {
    return "Bạn muốn cấu hình nhắc như thế nào? (trước bao nhiêu phút, bật/tắt nhắc)";
  }

  if (intent === "connect_messenger") {
    return "Bạn muốn kết nối Messenger theo page nào? Nếu có, gửi thêm thông tin page.";
  }

  if (intent === "plan_day") {
    return "Bạn muốn sắp lịch cho ngày nào? (hôm nay, ngày mai, hoặc ngày cụ thể)";
  }

  return "Mình chưa đủ thông tin. Bạn có thể nói rõ hơn yêu cầu được không?";
}
