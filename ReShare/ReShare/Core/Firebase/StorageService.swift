import UIKit

/// Service phụ trách upload hình ảnh vật phẩm lên Firebase Cloud Storage
final class StorageService {
    static let shared = StorageService()
    
    private init() {}
    
    /// Upload ảnh chụp vật phẩm lên Cloud Storage
    /// - Parameters:
    ///   - image: Ảnh UIImage cần upload
    ///   - path: Thư mục lưu trữ (mặc định: donation_images)
    ///   - completion: Trả về Download URL của ảnh sau khi upload thành công
    func uploadImage(image: UIImage, path: String = Constants.StoragePaths.donationImages, completion: @escaping (Result<String, Error>) -> Void) {
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            completion(.failure(NSError(domain: "StorageService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Không thể nén ảnh JPEG"])))
            return
        }
        
        // TODO: Kết nối với Storage.storage().reference()
        // Mô phỏng upload thành công trả về Mock URL:
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 0.5) {
            let mockURL = "https://images.unsplash.com/photo-1523381210434-271e8be1f52b"
            completion(.success(mockURL))
        }
    }
}
