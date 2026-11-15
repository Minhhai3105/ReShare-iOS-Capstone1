import Foundation

/// Số điện thoại trong hồ sơ donor (nhóm C, 15/11/2026): KHÔNG bắt buộc.
/// - Để trống (hoặc chỉ có khoảng trắng): hợp lệ — tài khoản Google cũng tạo hồ sơ không có số.
/// - Nếu nhập: chỉ gồm chữ số, khoảng trắng, dấu chấm, gạch ngang; có thể bắt đầu bằng một dấu "+";
///   từ 9 đến 12 chữ số (số Việt Nam 0xxx… 10 số, hoặc +84 và 9 số); tối đa 32 ký tự như firestore.rules.
/// Tách khỏi View để test trực tiếp (ReShareCoreTests/PhoneNumberRuleTests), dùng chung cho Đăng ký và Hồ sơ.
enum PhoneNumberRule {
    static let invalidMessage = "Số điện thoại gồm 9–12 chữ số (có thể bắt đầu bằng +). Bạn cũng có thể để trống."

    static func normalized(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func isValid(_ raw: String) -> Bool {
        let value = normalized(raw)
        if value.isEmpty { return true }
        guard value.count <= 32 else { return false }
        var body = Substring(value)
        if body.first == "+" { body = body.dropFirst() }
        let allowed = body.allSatisfy { $0.isASCII && ($0.isNumber || $0 == " " || $0 == "." || $0 == "-") }
        guard allowed else { return false }
        let digits = body.filter { $0.isNumber }.count
        return (9...12).contains(digits)
    }
}
