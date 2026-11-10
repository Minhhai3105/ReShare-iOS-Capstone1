import Foundation
import UIKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

// Lỗi riêng của luồng Google Sign-In, hiển thị thẳng cho người dùng.
enum GoogleSignInFlowError: Error {
    case notConfigured
    case noPresenter
    case missingIDToken

    var message: String {
        switch self {
        case .notConfigured:
            return "Đăng nhập Google chưa được bật cho bản app này. Vui lòng dùng email và mật khẩu."
        case .noPresenter:
            return "Không mở được cửa sổ đăng nhập Google. Vui lòng thử lại."
        case .missingIDToken:
            return "Google không trả về thông tin đăng nhập. Vui lòng thử lại."
        }
    }
}

protocol AuthServiceProtocol {
    func signUp(email: String, password: String) async throws -> String
    func signIn(email: String, password: String) async throws -> String
    func signOut() throws
    func sendPasswordReset(email: String) async throws
    var currentUser: String? { get }
}

final class AuthService: AuthServiceProtocol {
    static let shared = AuthService()
    
    private init() {}
    
    var currentUser: String? {
        Auth.auth().currentUser?.uid
    }

    var currentUserId: String? {
        currentUser
    }

    var currentDisplayName: String? {
        Auth.auth().currentUser?.displayName
    }

    var currentEmail: String? {
        Auth.auth().currentUser?.email
    }
    
    func signUp(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return result.user.uid
    }
    
    func signIn(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return result.user.uid
    }
    
    func signOut() throws {
        try Auth.auth().signOut()
        // Xoá luôn phiên Google để lần sau được chọn lại tài khoản; không có phiên Google thì không làm gì.
        GIDSignIn.sharedInstance.signOut()
    }

    // App đã có CLIENT_ID trong GoogleService-Info.plist và URL scheme tương ứng trong Info.plist chưa.
    var isGoogleSignInConfigured: Bool {
        GoogleSignInSetup.isConfigured(
            clientID: FirebaseApp.app()?.options.clientID,
            urlTypes: Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes")
        )
    }

    // Đăng nhập Google rồi đổi idToken sang phiên Firebase. Lần đầu sẽ tự tạo tài khoản Firebase.
    // Trả về nil khi người dùng tự đóng cửa sổ Google (không coi là lỗi).
    func signInWithGoogle(presenting viewController: UIViewController) async throws -> String? {
        guard isGoogleSignInConfigured, let clientID = FirebaseApp.app()?.options.clientID else {
            throw GoogleSignInFlowError.notConfigured
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        let result: GIDSignInResult
        do {
            result = try await GIDSignIn.sharedInstance.signIn(withPresenting: viewController)
        } catch let error as GIDSignInError where error.code == .canceled {
            return nil
        }

        guard let idToken = result.user.idToken?.tokenString else {
            throw GoogleSignInFlowError.missingIDToken
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        let authResult = try await Auth.auth().signIn(with: credential)
        return authResult.user.uid
    }

    // Firebase gửi thư chứa link đặt lại mật khẩu; trang nhập mật khẩu mới do Firebase host,
    // app không bao giờ chạm vào mật khẩu mới.
    func sendPasswordReset(email: String) async throws {
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }
}
