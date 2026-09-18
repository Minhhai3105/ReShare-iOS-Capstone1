import Foundation

/// Đại diện cho hồ sơ người dùng trong hệ thống ReShare
/// Lưu trữ trên Firestore Collection: `users/{userId}`
struct UserProfile: Identifiable, Codable {
    let id: String              // Firebase Auth UID
    var email: String
    var displayName: String
    var phoneNumber: String
    var role: UserRole          // donor | warehouse_admin | system_admin
    var createdAt: Date
    
    enum UserRole: String, Codable {
        case donor = "donor"
        case warehouseAdmin = "warehouse_admin"
        case systemAdmin = "system_admin"
    }
}
