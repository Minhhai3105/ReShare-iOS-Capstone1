import SwiftUI
import Combine

// Vỉewmodel điều phối luông xác thực ( Login/Register ) với Firebase thật

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
        Task { @MainActor in
            do {
                // 1. Đăng nhập qua Firebase Auth
                let uid = try await AuthService.shared.signIn(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
                
                // 2. lấy Profile từ FireStore để đảm bảo tài khoản hợp lệ
                _ = try await FirestoreService.shared.fetchUserProfile(userId: uid)
                
                // 3. Cập nhật trạng thái đăng nhập toàn cục
                self.isLoading = false
                appState.isAuthenticated = true
                appState.currentUserId = uid
            } catch {
                self.isLoading = false
                self.errorMessage = parseFirebaseError(error)
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
        
        guard password.count >= 6 else {
            errorMessage = "Mật khẩu phải có ít nhất 6 ký tự"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        Task { @MainActor in
            var createdUid: String? = nil
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
                    email: email.trimmingCharacters(in: .whitespaces),
                    displayName: fullName.trimmingCharacters(in: .whitespaces),
                    phoneNumber: phoneNumber.trimmingCharacters(in: .whitespaces),
                    role: .donor,
                    createdAt: Date()
                )
                
                // 3. Ghi vào Firestore collection "users" với Document ID = UID
                try await FirestoreService.shared.createUserProfile(newUserProfile)
                
                // 4. Thành công -> Đăng nhập vào app
                self.isLoading = false
                appState.isAuthenticated = true
                appState.currentUserId = uid
            } catch {
                self.isLoading = false
                self.errorMessage = parseFirebaseError(error)
                
                // Rollback nếu bước 2 ghi Firestore thất bại để tránh User mồ côi
                if let _ = createdUid {
                    try? await AuthService.shared.signOut()
                }
        
            }
             
        }
              
              
    }
    
    // Mark: helper chuyển đổi lỗi firebase sang Tiếng Việt
    private func parseFirebaseError(_ error: Error) -> String {
        let errDesc = error.localizedDescription
        if errDesc.contains("email address is already in use") {
            return "Email này đã được sử dụng bởi một tài khoản khác"
        } else if errDesc.contains("badly formatted") {
            return "Địa chỉ Email không đúng định dạng"
        } else if errDesc.contains("wrong-password") || errDesc.contains("user-not-found") || errDesc.contains("INVALID_LOGIN_CREDENTIALS") {
            return "Email hoặc mật khẩu không chính xác"
        } else if errDesc.contains("network error") {
            return "Lỗi kết nối mạng, vui lòng kiểm tra lại đường truyền"
        }
        return "Đã xảy ra lỗi: \(error.localizedDescription)"
    }
}
