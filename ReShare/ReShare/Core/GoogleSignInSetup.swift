import Foundation

// Kiểm tra cấu hình Google Sign-In trước khi gọi SDK.
// GoogleSignIn ném NSException (crash app) nếu thiếu URL scheme, nên phải chặn từ trước và báo lỗi tử tế.
enum GoogleSignInSetup {
    // "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc" (giống REVERSED_CLIENT_ID).
    static func reversedClientID(_ clientID: String) -> String? {
        let parts = clientID.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2, !parts.contains(where: \.isEmpty) else { return nil }
        return parts.reversed().joined(separator: ".")
    }

    // `urlTypes` là giá trị CFBundleURLTypes đọc từ Info.plist của app.
    static func isURLSchemeRegistered(_ scheme: String, urlTypes: Any?) -> Bool {
        guard let types = urlTypes as? [[String: Any]] else { return false }
        return types.contains { type in
            let schemes = type["CFBundleURLSchemes"] as? [String] ?? []
            return schemes.contains { $0.caseInsensitiveCompare(scheme) == .orderedSame }
        }
    }

    // Đủ cấu hình khi GoogleService-Info.plist có CLIENT_ID và Info.plist đã khai báo URL scheme tương ứng.
    static func isConfigured(clientID: String?, urlTypes: Any?) -> Bool {
        guard let clientID, let scheme = reversedClientID(clientID) else { return false }
        return isURLSchemeRegistered(scheme, urlTypes: urlTypes)
    }
}
