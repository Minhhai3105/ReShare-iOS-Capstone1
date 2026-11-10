import SwiftUI
import UIKit
import Combine
import FirebaseAuth
import FirebaseFirestore

// Vỉewmodel điều phối luông xác thực ( Login/Register ) với Firebase thật

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var fullName: String = ""
    @Published var phoneNumber: String = ""
    
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil
    
    // Mark: Luồng đăng nhập
    
    func login(appState: AppState) {
        guard !email.trimmingCharacters(in: .whitespaces).isEmpty,
              !password.isEmpty else {
            errorMessage = "Vui lòng nhập đầy đủ Email và Mật Khẩu"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        // Dùng Task để chuyển đổi từ giao diện đồng bộ sang bất đồng bộ (async/await)
        Task {
            defer { isLoading = false }
            do {
                // 1. Đăng nhập qua Firebase Auth
                let uid = try await AuthService.shared.signIn(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
                // 2. lấy Profile từ FireStore để đảm bảo tài khoản hợp lệ
                let profile = try await FirestoreService.shared.fetchOrCreateDonorProfile(userId: uid)
                // 3. Cập nhật trạng thái đăng nhập toàn cục
                appState.completeLogin(profile: profile)
            } catch {
                errorMessage = parseFirebaseError(error)
            }
        }
    }
    
    // Mark: Luồng đăng ký
    
    func register(appState: AppState) {
        guard !fullName.trimmingCharacters(in: .whitespaces).isEmpty,
              !email.trimmingCharacters(in: .whitespaces).isEmpty,
              !phoneNumber.trimmingCharacters(in: .whitespaces).isEmpty,
              !password.isEmpty else {
            errorMessage = "Vui lòng nhập đầy đủ thông tin"
            return
        }
        
        guard password.count >= 8 else {
            errorMessage = "Mật khẩu phải có ít nhất 8 ký tự"
            return
        }

        guard fullName.trimmingCharacters(in: .whitespaces).count <= 80,
              phoneNumber.trimmingCharacters(in: .whitespaces).count <= 32 else {
            errorMessage = "Tên tối đa 80 ký tự và số điện thoại tối đa 32 ký tự"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        Task {
            defer { isLoading = false }
            var createdUid: String?
            do {
                // 1. Tạo tk trên Firebase Auth để lấy UID
                let uid = try await AuthService.shared.signUp(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
                createdUid = uid
                
                // 2. Chuẩn bị model UserProfile với vai trò mặc định là .donor
                let newUserProfile = UserProfile(
                    id: uid,
                    email: AuthService.shared.currentEmail ?? email.trimmingCharacters(in: .whitespaces),
                    displayName: fullName.trimmingCharacters(in: .whitespaces),
                    phoneNumber: phoneNumber.trimmingCharacters(in: .whitespaces),
                    role: .donor,
                    createdAt: Date()
                )
                
                // 3. Ghi vào Firestore collection "users" với Document ID = UID
                try await FirestoreService.shared.createUserProfile(newUserProfile)
                
                // 4. Thành công -> Đăng nhập vào app
                appState.completeLogin(profile: newUserProfile)
            } catch {
                // Đóng phiên nếu chưa xác nhận được bước ghi hồ sơ; tài khoản Auth vẫn tồn tại.
                if createdUid != nil {
                    // signOut chỉ đóng phiên; tài khoản Auth vẫn tồn tại và có thể khôi phục hồ sơ khi đăng nhập lại.
                    try? AuthService.shared.signOut()
                    errorMessage = "Tài khoản đã được tạo nhưng chưa xác nhận được hồ sơ. Kiểm tra kết nối rồi đăng nhập lại; nếu vẫn lỗi, liên hệ hỗ trợ."
                } else {
                    errorMessage = parseFirebaseError(error)
                }
            }
        }
    }

    // Mark: Luồng đăng nhập / đăng ký bằng Google

    @Published var isGoogleLoading: Bool = false

    var isGoogleSignInAvailable: Bool {
        AuthService.shared.isGoogleSignInConfigured
    }

    func loginWithGoogle(appState: AppState) {
        guard !isLoading, !isGoogleLoading else { return }
        guard let presenter = Self.topViewController() else {
            errorMessage = GoogleSignInFlowError.noPresenter.message
            return
        }

        isGoogleLoading = true
        errorMessage = nil

        Task {
            defer { isGoogleLoading = false }
            var signedIn = false
            do {
                // 1. Google xác thực rồi đổi sang phiên Firebase; nil = người dùng tự huỷ
                guard let uid = try await AuthService.shared.signInWithGoogle(presenting: presenter) else { return }
                signedIn = true
                // 2. Lấy hoặc tạo hồ sơ donor (lần đầu dùng Google sẽ tạo mới, số điện thoại để trống)
                let profile = try await FirestoreService.shared.fetchOrCreateDonorProfile(userId: uid)
                // 3. Cập nhật trạng thái đăng nhập toàn cục
                appState.completeLogin(profile: profile)
            } catch {
                // Đã có phiên Firebase nhưng chưa lấy được hồ sơ thì đóng phiên để không kẹt nửa vời.
                if signedIn { try? AuthService.shared.signOut() }
                errorMessage = parseFirebaseError(error)
            }
        }
    }

    // ViewController đang hiển thị trên cùng, để SDK Google trình bày cửa sổ đăng nhập.
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    // Mark: Luồng quên mật khẩu
    // State riêng để lỗi/loading của sheet không lẫn với form đăng nhập phía sau.

    @Published var resetEmail: String = ""
    @Published var isSendingReset: Bool = false
    @Published var resetErrorMessage: String? = nil
    @Published var resetSentMessage: String? = nil
    @Published private(set) var lastResetSentAt: Date? = nil

    // Thông báo trung tính: không cho biết email có tài khoản hay không, tránh bị dò danh sách tài khoản.
    static let resetSentNotice = "Nếu email này đã đăng ký ReShare, thư đặt lại mật khẩu sẽ đến trong vài phút. Hãy kiểm tra cả mục Spam/Quảng cáo."

    // Gọi khi mở sheet: điền sẵn email đang gõ ở form đăng nhập và xoá thông báo cũ.
    func prepareForPasswordReset() {
        resetEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        resetErrorMessage = nil
        resetSentMessage = nil
    }

    func sendPasswordReset() {
        guard !isSendingReset else { return }
        guard let normalizedEmail = PasswordResetPolicy.normalizedEmail(resetEmail) else {
            resetErrorMessage = "Vui lòng nhập đúng địa chỉ email đã dùng để đăng ký."
            return
        }
        guard PasswordResetPolicy.secondsUntilResend(lastSentAt: lastResetSentAt) == 0 else { return }

        isSendingReset = true
        resetErrorMessage = nil
        resetSentMessage = nil

        Task {
            defer { isSendingReset = false }
            do {
                try await AuthService.shared.sendPasswordReset(email: normalizedEmail)
                markResetSent(to: normalizedEmail)
            } catch {
                let nsError = error as NSError
                if nsError.domain == AuthErrorDomain,
                   AuthErrorCode(rawValue: nsError.code) == .userNotFound {
                    // Trả lời giống hệt khi thành công để không lộ email nào đã có tài khoản.
                    markResetSent(to: normalizedEmail)
                } else {
                    resetErrorMessage = parseFirebaseError(error)
                }
            }
        }
    }

    private func markResetSent(to sentEmail: String) {
        lastResetSentAt = Date()
        resetSentMessage = Self.resetSentNotice
        // Điền lại email vào form đăng nhập để đặt mật khẩu xong quay lại đăng nhập luôn.
        email = sentEmail
        password = ""
    }

    // Mark: helper chuyển đổi lỗi firebase sang Tiếng Việt
    private func parseFirebaseError(_ error: Error) -> String {
        if let googleError = error as? GoogleSignInFlowError {
            return googleError.message
        }
        let nsError = error as NSError
        if nsError.domain == AuthErrorDomain,
           let code = AuthErrorCode(rawValue: nsError.code) {
            switch code {
            case .emailAlreadyInUse:
                return "Email này đã được sử dụng. Hãy đăng nhập bằng tài khoản hiện có."
            case .invalidEmail:
                return "Địa chỉ email không đúng định dạng."
            case .wrongPassword:
                return "Mật khẩu không đúng."
            case .userNotFound:
                return "Tài khoản này chưa tồn tại."
            case .invalidCredential:
                return "Email hoặc mật khẩu không chính xác."
            case .weakPassword:
                return "Mật khẩu chưa đáp ứng yêu cầu bảo mật."
            case .networkError:
                return "Không có kết nối mạng. Vui lòng kiểm tra và thử lại."
            case .invalidUserToken, .userTokenExpired:
                return "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại."
            case .userDisabled:
                return "Tài khoản này đã bị khóa."
            case .tooManyRequests:
                return "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại."
            case .operationNotAllowed:
                return "Cách đăng nhập này chưa được bật trên hệ thống. Vui lòng dùng email và mật khẩu."
            case .accountExistsWithDifferentCredential:
                return "Email này đã đăng ký bằng cách khác. Hãy đăng nhập bằng email và mật khẩu."
            default:
                break
            }
        }
        if nsError.domain == FirestoreErrorDomain {
            switch nsError.code {
            case FirestoreErrorCode.unavailable.rawValue,
                 FirestoreErrorCode.deadlineExceeded.rawValue:
                return "Không thể kết nối để tải hồ sơ. Vui lòng thử lại khi có mạng."
            case FirestoreErrorCode.unauthenticated.rawValue:
                return "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại."
            case FirestoreErrorCode.permissionDenied.rawValue:
                return "Không có quyền truy cập hồ sơ. Vui lòng liên hệ hỗ trợ nếu lỗi tiếp tục."
            default:
                break
            }
        }
        if nsError.domain == NSURLErrorDomain {
            return "Không có kết nối mạng. Vui lòng kiểm tra và thử lại."
        }
        return "Không thể hoàn tất yêu cầu. Vui lòng thử lại."
    }
}
