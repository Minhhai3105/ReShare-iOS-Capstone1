import Foundation

/// Các hằng số cấu hình toàn ứng dụng ReShare
enum Constants {
    enum FirestoreCollections {
        static let users = "users"
        static let catalogItems = "catalog_items"
        static let campaigns = "campaigns"
        static let donations = "donations"
        static let hubs = "hubs"
        static let conversations = "conversations"
        static let messages = "messages"
        static let beneficiaries = "beneficiaries"
        static let dropoffLocations = "dropoff_locations"
    }
    
    enum StoragePaths {
        static let donationImages = "donation_images"
        static let catalogImages = "catalog_images"
        static let avatars = "avatars"
    }
    
    /// Trang pháp lý công khai trên website (App Store Review Guideline 1.5, 5.1.1(i)).
    /// Path phải khớp ReShare-Web/src/landing/legal.js; test web kiểm tra hai bên trùng nhau.
    enum Links {
        static let privacyPolicy = URL(string: "https://reshare.pages.dev/chinh-sach-quyen-rieng-tu")!
        static let supportEmail = "haicao206@gmail.com"
        static var supportMail: URL {
            URL(string: "mailto:\(supportEmail)?subject=ReShare%20-%20H%E1%BB%97%20tr%E1%BB%A3")!
        }
    }

    enum Defaults {
        static let defaultMapLatitude = 10.7769   // Tọa độ trung tâm TP.HCM
        static let defaultMapLongitude = 106.7009
    }
}
