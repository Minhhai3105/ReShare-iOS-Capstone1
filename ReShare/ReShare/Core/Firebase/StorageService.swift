import UIKit
import FirebaseStorage

struct StorageImageUploadError: LocalizedError {
    enum Phase: Equatable {
        case upload
        case downloadURL
    }

    let phase: Phase
    let underlyingError: Error

    var errorDescription: String? { underlyingError.localizedDescription }
}

/// Service phụ trách upload và quản lý hình ảnh vật phẩm trên Firebase Cloud Storage
final class StorageService {
    static let shared = StorageService()
    
    private var storageRef: StorageReference {
        Storage.storage().reference()
    }
    
    private init() {}
    
    /// Upload 1 ảnh UIImage lên Firebase Storage
    func uploadImage(image: UIImage, path: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw NSError(domain: "StorageService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Không thể nén ảnh JPEG"])
        }
        let fileName = "\(UUID().uuidString).jpg"
        let fileRef = storageRef.child(path).child(fileName)
        
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        
        do {
            _ = try await fileRef.putDataAsync(data, metadata: metadata)
        } catch {
            logFailure(error, phase: .upload, reference: fileRef)
            throw StorageImageUploadError(phase: .upload, underlyingError: error)
        }

        do {
            let downloadURL = try await fileRef.downloadURL()
            return downloadURL.absoluteString
        } catch {
            logFailure(error, phase: .downloadURL, reference: fileRef)
            // Upload đã hoàn tất nhưng không lấy được URL: xóa file hiện tại để tránh ảnh mồ côi.
            do {
                try await fileRef.delete()
            } catch {
                let nsError = error as NSError
                if nsError.domain != StorageErrorDomain || nsError.code != StorageErrorCode.objectNotFound.rawValue {
                    print("⚠️ [Storage] Không thể dọn ảnh \(fileRef.fullPath): \(error.localizedDescription)")
                }
            }
            throw StorageImageUploadError(phase: .downloadURL, underlyingError: error)
        }
    }
    
    /// Upload đồng thời một mảng 3-6 ảnh lên Storage, trả về danh sách URL (Tự động dọn dẹp nếu hỏng giữa chừng)
    func uploadImages(_ images: [UIImage], path: String) async throws -> [String] {
        guard !images.isEmpty else { return [] }
        
        var uploadedUrls: [String] = []
        do {
            for img in images {
                let url = try await uploadImage(image: img, path: path)
                uploadedUrls.append(url)
            }
            return uploadedUrls
        } catch {
            // Tự động dọn dẹp các ảnh đã upload trước đó nếu có ảnh sau bị lỗi
            if !uploadedUrls.isEmpty {
                await deleteUploadedImages(urls: uploadedUrls)
            }
            throw error
        }
    }
    
    /// Dọn dẹp/xóa các ảnh mồ côi trên Storage nếu quá trình tạo đơn bị hủy hoặc lỗi
    func deleteUploadedImages(urls: [String]) async {
        for urlString in urls {
            let ref = Storage.storage().reference(forURL: urlString)
            do {
                try await ref.delete()
            } catch {
                let nsError = error as NSError
                if nsError.domain != StorageErrorDomain || nsError.code != StorageErrorCode.objectNotFound.rawValue {
                    print("⚠️ [Storage] Không thể dọn ảnh \(ref.fullPath): \(error.localizedDescription)")
                }
            }
        }
    }

    private func logFailure(_ error: Error, phase: StorageImageUploadError.Phase, reference: StorageReference) {
        let nsError = error as NSError
        print("❌ [Storage] phase=\(phase) bucket=\(reference.bucket) path=\(reference.fullPath) domain=\(nsError.domain) code=\(nsError.code): \(error.localizedDescription)")
    }
}
