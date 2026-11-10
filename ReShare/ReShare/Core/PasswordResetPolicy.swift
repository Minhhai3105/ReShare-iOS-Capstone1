import Foundation

// Quy tắc thuần của luồng quên mật khẩu, tách khỏi Firebase để kiểm thử được bằng `swift test`.
enum PasswordResetPolicy {
    // Khoảng chờ giữa hai lần gửi thư từ cùng một màn hình. Firebase vẫn có giới hạn riêng phía server.
    static let resendCooldown: TimeInterval = 60

    // Trả về email đã bỏ khoảng trắng hai đầu nếu đúng hình thức cơ bản, ngược lại trả nil.
    // Chỉ chặn lỗi gõ hiển nhiên; Firebase mới là nơi quyết định email có hợp lệ hay không.
    static func normalizedEmail(_ raw: String) -> String? {
        let email = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, email.count <= 254, !email.contains(where: \.isWhitespace) else { return nil }

        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty else { return nil }

        // Tên miền phải có dấu chấm, không nằm ở đầu hay cuối (chặn "a@b", "a@.com", "a@b.").
        let domain = parts[1]
        guard let dot = domain.lastIndex(of: "."),
              dot != domain.startIndex,
              domain.index(after: dot) != domain.endIndex else { return nil }
        return email
    }

    // Số giây còn phải chờ trước khi được gửi lại (làm tròn lên); 0 nghĩa là gửi được ngay.
    static func secondsUntilResend(lastSentAt: Date?, now: Date = Date()) -> Int {
        guard let lastSentAt else { return 0 }
        let remaining = resendCooldown - now.timeIntervalSince(lastSentAt)
        return remaining > 0 ? Int(remaining.rounded(.up)) : 0
    }
}
