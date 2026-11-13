import Foundation
import FirebaseAuth

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
    }

    /// Gửi thư đặt lại mật khẩu (Firebase lo trang đặt mật khẩu mới). Thư soạn bằng tiếng Việt.
    /// Firebase bật chống dò email nên không báo email có tồn tại hay không — UI cũng phải nói trung lập.
    func sendPasswordReset(email: String) async throws {
        Auth.auth().languageCode = "vi"
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }
}
