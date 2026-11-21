import Foundation

/// Ngày giờ hiển thị cho người dùng theo kiểu Việt Nam (vd: "20/11/2026 21:44").
/// Cố định định dạng thay cho `Date.formatted(...)`, vì kiểu đó đổi theo ngôn ngữ của máy
/// (máy để tiếng Anh sẽ hiện "20 Nov 2026 at 21:44"). Múi giờ vẫn theo máy.
/// Tách khỏi View để test trực tiếp (ReShareCoreTests/VietnameseDateTextTests).
enum VietnameseDateText {
    static func dateTime(_ date: Date, timeZone: TimeZone = .current) -> String {
        formatter("dd/MM/yyyy HH:mm", timeZone: timeZone).string(from: date)
    }

    static func date(_ date: Date, timeZone: TimeZone = .current) -> String {
        formatter("dd/MM/yyyy", timeZone: timeZone).string(from: date)
    }

    private static func formatter(_ format: String, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }
}
