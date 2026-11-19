import Foundation

nonisolated struct CatalogPublishPayload: Codable, Equatable, Sendable {
    let donorId: String
    let donorName: String
    let title: String
    let category: String
    let condition: String
    let district: String
    let pickupAddress: String
    let donorNote: String
    let imageName: String
}

nonisolated struct CatalogPublishAsset: Codable, Equatable, Sendable {
    let publicId: String
    let secureURL: String
}

nonisolated struct CatalogPublishJob: Codable, Identifiable, Equatable, Sendable {
    enum State: String, Codable, Sendable {
        case queued, uploading, saving, failed, published
    }

    let id: String
    let payload: CatalogPublishPayload
    let createdAt: Date
    let imageClientIDs: [String]
    var uploaded: [CatalogPublishAsset?]
    var state: State = .queued
    var errorMessage: String?

    init(id: String, payload: CatalogPublishPayload, imageCount: Int) {
        self.id = id
        self.payload = payload
        createdAt = Date()
        imageClientIDs = (0..<imageCount).map { _ in UUID().uuidString.lowercased() }
        uploaded = Array(repeating: nil, count: imageCount)
    }

    var completedImageCount: Int { uploaded.compactMap { $0 }.count }
}

nonisolated enum CatalogPublishQueueError: LocalizedError {
    case invalidDraft, duplicateDraft, accountChanged, missingImage

    var errorDescription: String? {
        switch self {
        case .invalidDraft: return "Bản chờ đăng không hợp lệ. Vui lòng kiểm tra lại nội dung và ảnh."
        case .duplicateDraft: return "Bài này đã nằm trong danh sách chờ đăng."
        case .accountChanged: return "Tài khoản đã thay đổi. Vui lòng đăng nhập lại đúng tài khoản."
        case .missingImage: return "Không đọc được ảnh của bản chờ đăng. Nội dung vẫn được giữ trên máy."
        }
    }
}
