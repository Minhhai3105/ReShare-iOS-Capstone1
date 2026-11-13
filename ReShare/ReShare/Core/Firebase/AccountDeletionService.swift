import Foundation
import FirebaseAuth

/// Xoá tài khoản ngay trong app (App Store Review Guideline 5.1.1(v)).
/// Bắt nhập lại mật khẩu để có phiên mới (backend từ chối nếu lần đăng nhập cũ hơn 5 phút),
/// rồi gọi POST /v1/account/delete. Backend dùng Admin SDK để ẩn danh đơn quyên góp, gỡ bài
/// Kho đồ 0đ đang mở, đổi tên trong chat, xoá hồ sơ và xoá tài khoản Firebase Auth.
@MainActor
enum AccountDeletionService {
    enum DeletionError: LocalizedError, Equatable {
        case notSignedIn
        case wrongPassword
        case staffAccount
        case missingConfiguration
        case server(String)

        nonisolated var errorDescription: String? {
            switch self {
            case .notSignedIn:
                return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại rồi thử xoá tài khoản."
            case .wrongPassword:
                return "Mật khẩu không đúng."
            case .staffAccount:
                return "Tài khoản này đang là nhân sự ReShare. Liên hệ Quản trị hệ thống để thu hồi quyền trước khi xoá."
            case .missingConfiguration:
                return "Ứng dụng chưa cấu hình địa chỉ máy chủ."
            case .server(let message):
                return message
            }
        }
    }

    static func deleteAccount(password: String) async throws {
        guard let user = Auth.auth().currentUser, let email = user.email else { throw DeletionError.notSignedIn }
        do {
            _ = try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, password: password))
        } catch let error as NSError {
            let code = AuthErrorCode(rawValue: error.code)
            if code == .wrongPassword || code == .invalidCredential { throw DeletionError.wrongPassword }
            throw DeletionError.server("Không xác minh được mật khẩu: \(error.localizedDescription)")
        }
        guard let baseURL = ReShareAPIConfiguration.configuredBaseURL() else { throw DeletionError.missingConfiguration }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/account/delete"))
        request.httpMethod = "POST"
        // Máy chủ Render bản miễn phí có thể mất 30–50 giây để khởi động.
        request.timeoutInterval = 120
        request.setValue("Bearer \(try await user.getIDToken(forcingRefresh: true))", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DeletionError.server("Máy chủ trả phản hồi không hợp lệ.") }
        guard (200...299).contains(http.statusCode) else {
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            if payload?["code"] as? String == "STAFF_ACCOUNT" { throw DeletionError.staffAccount }
            if payload?["code"] as? String == "REAUTH_REQUIRED" {
                throw DeletionError.server("Phiên xác minh đã quá 5 phút. Vui lòng nhập lại mật khẩu.")
            }
            throw DeletionError.server("Chưa xoá được tài khoản (HTTP \(http.statusCode)). Vui lòng thử lại sau.")
        }
        guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              payload["deleted"] as? Bool == true else {
            throw DeletionError.server("Chưa xác nhận được việc xoá. Vui lòng thử lại; thao tác này an toàn khi lặp lại.")
        }
    }
}
