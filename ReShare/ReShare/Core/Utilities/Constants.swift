import Foundation

/// Các hằng số cấu hình toàn ứng dụng ReShare
enum Constants {
    enum FirestoreCollections {
        static let users = "users"
        static let donations = "donations"
        static let beneficiaries = "beneficiaries"
        static let dropoffLocations = "dropoff_locations"
    }
    
    enum StoragePaths {
        static let donationImages = "donation_images"
        static let avatars = "avatars"
    }
    
    enum Defaults {
        static let defaultMapLatitude = 10.7769   // Tọa độ trung tâm TP.HCM
        static let defaultMapLongitude = 106.7009
    }
}
