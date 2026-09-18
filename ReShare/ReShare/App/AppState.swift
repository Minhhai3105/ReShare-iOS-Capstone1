import SwiftUI
import Combine

/// Quản lý Global State (Trạng thái toàn cục) của ứng dụng ReShare
/// Chịu trách nhiệm:
/// 1. Lưu giữ phiên đăng nhập của người dùng (Session Management)
/// 2. Điều hướng màn hình gốc (Root Navigation: Auth vs Main Tab Bar)
final class AppState: ObservableObject {
    /// Trạng thái đăng nhập của người dùng
    @Published var isAuthenticated: Bool = false
    
    /// User ID của người dùng hiện tại (nếu đã đăng nhập)
    @Published var currentUserId: String? = nil
    
    /// Khởi tạo trạng thái ban đầu và lắng nghe Firebase Auth listener
    init() {
        // TODO: Kết nối với FirebaseAuthService để check session khi mở app
        self.isAuthenticated = false
    }
    
    /// Đăng xuất và dọn dẹp state
    func logout() {
        self.isAuthenticated = false
        self.currentUserId = nil
    }
}
