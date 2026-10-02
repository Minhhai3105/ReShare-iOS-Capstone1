import SwiftUI
import Combine
import FirebaseAuth
import FirebaseCore

/// Quản lý Global State (Trạng thái toàn cục) của ứng dụng ReShare
/// Chịu trách nhiệm:
/// 1. Lưu giữ phiên đăng nhập của người dùng (Session Management)
/// 2. Điều hướng màn hình gốc (Root Navigation: Auth vs Main Tab Bar)
@MainActor
final class AppState: ObservableObject {
    /// Trạng thái đăng nhập của người dùng
    @Published var isAuthenticated: Bool = false

    /// User ID của người dùng hiện tại (nếu đã đăng nhập)
    @Published var currentUserId: String? = nil
    @Published var currentUserProfile: UserProfile? = nil
    @Published var isRestoringSession: Bool = true
    @Published var sessionError: String? = nil

    private var hasRestoredSession = false
    private var authStateListener: AuthStateDidChangeListenerHandle?

    // Firebase Auth listener được đăng ký khi khôi phục phiên để nhận biết phiên bị thu hồi khi app đang mở.

    /// Gọi sau khi FirebaseApp đã cấu hình; không tạo hồ sơ mới khi chỉ mất mạng.
    func restoreSession() async {
        guard !hasRestoredSession else { return }
        hasRestoredSession = true
        guard FirebaseApp.app() != nil else {
            isRestoringSession = false
            return
        }
        observeAuthState()
        guard let userId = AuthService.shared.currentUser else {
            isRestoringSession = false
            return
        }
        let timeout = Task {
            do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { return }
            if isRestoringSession {
                sessionError = "Kết nối quá lâu. Bạn có thể đăng nhập lại."
                isRestoringSession = false
            }
        }
        defer {
            timeout.cancel()
            isRestoringSession = false
        }
        do {
            let profile = try await FirestoreService.shared.fetchOrCreateDonorProfile(userId: userId)
            if isRestoringSession { completeLogin(profile: profile) }
        } catch {
            if isRestoringSession {
                if AuthService.shared.currentUser == nil {
                    clearSession(message: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.")
                } else {
                    sessionError = "Không thể tải hồ sơ. Kiểm tra kết nối rồi đăng nhập lại."
                }
            }
        }
    }

    private func observeAuthState() {
        guard authStateListener == nil else { return }
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            let observedUserId = user?.uid
            Task { @MainActor [weak self] in
                guard let self, self.isAuthenticated,
                      observedUserId != self.currentUserId else { return }
                self.clearSession(message: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.")
            }
        }
    }

    /// Kiểm tra token khi app trở lại màn hình; lỗi mạng không tự đăng xuất người dùng.
    func validateCurrentSession() async {
        guard isAuthenticated, let userId = currentUserId else { return }
        guard let user = Auth.auth().currentUser, user.uid == userId else {
            clearSession(message: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.")
            return
        }
        do {
            _ = try await user.getIDToken(forcingRefresh: false)
        } catch {
            guard currentUserId == userId else { return }
            let nsError = error as NSError
            guard nsError.domain == AuthErrorDomain,
                  let code = AuthErrorCode(rawValue: nsError.code) else { return }
            switch code {
            case .invalidUserToken, .userTokenExpired, .userDisabled, .userNotFound:
                try? AuthService.shared.signOut()
                clearSession(message: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.")
            default:
                break
            }
        }
    }

    func completeLogin(profile: UserProfile) {
        currentUserId = profile.id
        currentUserProfile = profile
        sessionError = nil
        isAuthenticated = true
    }

    func updateProfile(displayName: String, phoneNumber: String) async throws {
        guard let userId = currentUserId else {
            throw NSError(domain: "ReShare.Profile", code: 401, userInfo: [NSLocalizedDescriptionKey: "Bạn cần đăng nhập."])
        }
        currentUserProfile = try await FirestoreService.shared.updateUserProfile(
            userId: userId,
            displayName: displayName,
            phoneNumber: phoneNumber
        )
    }

    /// Đăng xuất và dọn dẹp state
    func logout() throws {
        try AuthService.shared.signOut()
        clearSession(message: nil)
    }

    private func clearSession(message: String?) {
        isAuthenticated = false
        currentUserId = nil
        currentUserProfile = nil
        sessionError = message
    }
}
