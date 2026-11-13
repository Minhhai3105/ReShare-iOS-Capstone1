import Foundation
import UIKit
import FirebaseAuth

/// Xoá tài khoản ngay trong app (App Store Review Guideline 5.1.1(v)).
/// Bắt xác minh lại để có phiên mới (backend từ chối nếu lần đăng nhập cũ hơn 5 phút): tài khoản có
/// mật khẩu thì nhập lại mật khẩu, tài khoản chỉ đăng nhập Google thì chọn lại đúng tài khoản Google.
/// Rồi gọi POST /v1/account/delete. Backend dùng Admin SDK để ẩn danh đơn quyên góp, gỡ bài
/// Kho đồ 0đ đang mở, đổi tên trong chat, xoá hồ sơ và xoá tài khoản Firebase Auth.
@MainActor
enum AccountDeletionService {
    enum DeletionError: LocalizedError, Equatable {
        case notSignedIn
        case wrongPassword
        case googleAccountMismatch
        case staffAccount
        case handoverInProgress
        case missingConfiguration
        case server(String)

        nonisolated var errorDescription: String? {
            switch self {
            case .notSignedIn:
                return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại rồi thử xoá tài khoản."
            case .wrongPassword:
                return "Mật khẩu không đúng."
            case .googleAccountMismatch:
                return "Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản đang đăng nhập ReShare."
            case .staffAccount:
                return "Tài khoản này đang là nhân sự ReShare. Liên hệ Quản trị hệ thống để thu hồi quyền trước khi xoá."
            case .handoverInProgress:
                return "Bạn đang có món bàn giao dở (một bên đã bấm xác nhận). Hãy hoàn tất bàn giao trong cuộc trò chuyện rồi xoá tài khoản."
            case .missingConfiguration:
                return "Ứng dụng chưa cấu hình địa chỉ máy chủ."
            case .server(let message):
                return message
            }
        }
    }

    /// Kết quả xoá. `imagesPending` > 0: tài khoản đã xoá nhưng còn ảnh Cloudinary chưa dọn được,
    /// máy chủ sẽ tự thử lại (image_cleanup_jobs) — app báo cho người dùng biết thay vì nói đã xong hết.
    struct Outcome: Equatable {
        let imagesPending: Int
    }

    /// true: tài khoản có mật khẩu (đăng ký bằng email). false: chỉ đăng nhập bằng Google.
    static var usesPassword: Bool {
        guard let providers = Auth.auth().currentUser?.providerData.map(\.providerID), !providers.isEmpty else { return true }
        return providers.contains(EmailAuthProviderID)
    }

    static func deleteAccount(password: String) async throws -> Outcome {
        guard let user = Auth.auth().currentUser, let email = user.email else { throw DeletionError.notSignedIn }
        do {
            _ = try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, password: password))
        } catch let error as NSError {
            let code = AuthErrorCode(rawValue: error.code)
            if code == .wrongPassword || code == .invalidCredential { throw DeletionError.wrongPassword }
            throw DeletionError.server("Không xác minh được mật khẩu: \(error.localizedDescription)")
        }
        return try await requestDeletion(user)
    }

    /// Xác minh lại bằng Google rồi xoá. Trả nil khi người dùng tự đóng cửa sổ Google (không xoá gì).
    static func deleteAccountWithGoogle(presenting viewController: UIViewController) async throws -> Outcome? {
        guard let user = Auth.auth().currentUser else { throw DeletionError.notSignedIn }
        let credential: AuthCredential
        do {
            guard let picked = try await AuthService.shared.googleCredential(presenting: viewController, hint: user.email) else {
                return nil
            }
            credential = picked
        } catch {
            throw DeletionError.server("Không mở được đăng nhập Google. Kiểm tra kết nối rồi thử lại.")
        }
        do {
            _ = try await user.reauthenticate(with: credential)
        } catch let error as NSError {
            if AuthErrorCode(rawValue: error.code) == .userMismatch { throw DeletionError.googleAccountMismatch }
            throw DeletionError.server("Không xác minh được tài khoản Google: \(error.localizedDescription)")
        }
        return try await requestDeletion(user)
    }

    private static func requestDeletion(_ user: User) async throws -> Outcome {
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
            if payload?["code"] as? String == "HANDOVER_IN_PROGRESS" { throw DeletionError.handoverInProgress }
            if payload?["code"] as? String == "REAUTH_REQUIRED" {
                throw DeletionError.server("Phiên xác minh đã quá 5 phút. Vui lòng xác minh lại rồi thử xoá.")
            }
            throw DeletionError.server("Chưa xoá được tài khoản (HTTP \(http.statusCode)). Vui lòng thử lại sau.")
        }
        guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              payload["deleted"] as? Bool == true else {
            throw DeletionError.server("Chưa xác nhận được việc xoá. Vui lòng thử lại; thao tác này an toàn khi lặp lại.")
        }
        let summary = payload["summary"] as? [String: Any]
        return Outcome(imagesPending: (summary?["imagesPending"] as? Int) ?? 0)
    }
}
