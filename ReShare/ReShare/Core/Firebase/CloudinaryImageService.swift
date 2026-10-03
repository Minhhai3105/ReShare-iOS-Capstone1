import Foundation
import FirebaseAuth
import UIKit

enum CloudinaryImagePurpose: String, Encodable, Sendable {
    case catalogItem = "catalog_item"
    case donation

    var deliveryType: String {
        switch self {
        case .catalogItem: return "upload"
        case .donation: return "authenticated"
        }
    }

    var pathPrefix: String {
        switch self {
        case .catalogItem: return "catalog_items"
        case .donation: return "donations"
        }
    }
}

struct CloudinaryUploadedImage: Hashable, Sendable {
    let publicId: String
    let secureURL: String?
}

enum CloudinaryImageError: LocalizedError {
    case missingConfiguration
    case signedOut
    case invalidImage
    case invalidServerResponse
    case uploadRejected
    case serverRejected(Int)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Dịch vụ ảnh chưa được cấu hình. Vui lòng thiết lập RESHARE_IMAGE_API_BASE_URL."
        case .signedOut:
            return "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại."
        case .invalidImage:
            return "Không thể chuẩn bị ảnh JPEG để tải lên."
        case .invalidServerResponse:
            return "Máy chủ ảnh trả về dữ liệu không hợp lệ. Vui lòng thử lại."
        case .uploadRejected:
            return "Cloudinary từ chối ảnh. Vui lòng thử lại hoặc chọn ảnh khác."
        case .serverRejected(let status):
            if status == 401 { return "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại." }
            if status == 403 { return "Bạn chưa có quyền thực hiện thao tác với ảnh này." }
            if status == 413 { return "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn." }
            return "Máy chủ ảnh đang lỗi (HTTP \(status)). Vui lòng thử lại."
        }
    }
}

/// iOS chỉ nhận chữ ký từ backend ReShare. API secret Cloudinary không nằm trong app.
final class CloudinaryImageService {
    static let shared = CloudinaryImageService()

    private struct UploadIntentRequest: Encodable {
        let purpose: CloudinaryImagePurpose
        let recordId: String
        let clientImageId: String
    }

    private struct UploadIntent: Decodable, Sendable {
        let cloudName: String
        let apiKey: String
        let timestamp: Int
        let signature: String
        let publicId: String
        let deliveryType: String
    }

    private struct UploadResponse: Decodable {
        let publicId: String
        let secureURL: String
        let deliveryType: String

        private enum CodingKeys: String, CodingKey {
            case publicId = "public_id"
            case secureURL = "secure_url"
            case deliveryType = "type"
        }
    }

    private struct CleanupRequest: Encodable {
        let purpose: CloudinaryImagePurpose
        let recordId: String
        let publicIds: [String]
    }

    private struct ReadAccessRequest: Encodable {
        let donationId: String
        let publicId: String
    }

    private struct ReadAccessResponse: Decodable {
        let url: String
    }

    private init() {}

    func uploadImages(_ images: [UIImage], purpose: CloudinaryImagePurpose, recordId: String) async throws -> [CloudinaryUploadedImage] {
        guard !images.isEmpty else { return [] }
        var uploaded: [CloudinaryUploadedImage] = []

        do {
            var preparedImages: [(jpeg: Data, intent: UploadIntent)] = []
            for image in images {
                guard let jpeg = image.jpegData(compressionQuality: 0.7) else {
                    throw CloudinaryImageError.invalidImage
                }
                let clientImageId = UUID().uuidString.lowercased()
                let intent: UploadIntent = try await backendRequest(
                    "v1/images/upload-intents",
                    body: UploadIntentRequest(purpose: purpose, recordId: recordId, clientImageId: clientImageId)
                )
                guard intent.deliveryType == purpose.deliveryType,
                      intent.publicId.hasPrefix("\(purpose.pathPrefix)/\(recordId)/"),
                      !intent.cloudName.isEmpty,
                      !intent.cloudName.contains("/"),
                      !intent.apiKey.isEmpty,
                      !intent.signature.isEmpty else {
                    throw CloudinaryImageError.invalidServerResponse
                }
                preparedImages.append((jpeg, intent))
            }

            var uploadedByIndex = [CloudinaryUploadedImage?](repeating: nil, count: preparedImages.count)
            for batchStart in stride(from: 0, to: preparedImages.count, by: 3) {
                let batchEnd = min(batchStart + 3, preparedImages.count)
                let results = await withTaskGroup(of: (Int, Result<CloudinaryUploadedImage, Error>).self) { group in
                    for index in batchStart..<batchEnd {
                        let jpeg = preparedImages[index].jpeg
                        let intent = preparedImages[index].intent
                        group.addTask {
                            do {
                                return (index, .success(try await self.upload(jpeg, intent: intent, purpose: purpose)))
                            } catch {
                                return (index, .failure(error))
                            }
                        }
                    }
                    var results: [(Int, Result<CloudinaryUploadedImage, Error>)] = []
                    for await result in group { results.append(result) }
                    return results
                }

                var firstError: Error?
                for (index, result) in results {
                    switch result {
                    case .success(let image):
                        uploadedByIndex[index] = image
                        uploaded.append(image)
                    case .failure(let error):
                        if firstError == nil { firstError = error }
                    }
                }
                if let firstError { throw firstError }
            }
            return uploadedByIndex.compactMap { $0 }
        } catch {
            if !uploaded.isEmpty {
                do {
                    try await deleteImages(uploaded, purpose: purpose, recordId: recordId)
                } catch {
                    print("⚠️ [Cloudinary] Không thể dọn ảnh sau lỗi upload: \(error.localizedDescription)")
                }
            }
            throw error
        }
    }

    func deleteImages(_ images: [CloudinaryUploadedImage], purpose: CloudinaryImagePurpose, recordId: String) async throws {
        guard !images.isEmpty else { return }
        let _: EmptyResponse = try await backendRequest(
            "v1/images/cleanup",
            body: CleanupRequest(purpose: purpose, recordId: recordId, publicIds: images.map(\.publicId))
        )
    }

    func privateDonationImageURL(donationId: String, publicId: String) async throws -> URL {
        guard publicId.hasPrefix("donations/\(donationId)/") else {
            throw CloudinaryImageError.invalidServerResponse
        }
        let response: ReadAccessResponse = try await backendRequest(
            "v1/images/read-access",
            body: ReadAccessRequest(donationId: donationId, publicId: publicId)
        )
        guard let url = URL(string: response.url), url.scheme == "https" else {
            throw CloudinaryImageError.invalidServerResponse
        }
        return url
    }

    private func upload(_ jpeg: Data, intent: UploadIntent, purpose: CloudinaryImagePurpose) async throws -> CloudinaryUploadedImage {
        guard let cloudName = intent.cloudName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "https://api.cloudinary.com/v1_1/\(cloudName)/image/upload") else {
            throw CloudinaryImageError.invalidServerResponse
        }
        let boundary = "ReShare-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(jpeg: jpeg, intent: intent, boundary: boundary)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudinaryImageError.invalidServerResponse }
        guard (200...299).contains(http.statusCode) else { throw CloudinaryImageError.uploadRejected }
        guard let uploaded = try? JSONDecoder().decode(UploadResponse.self, from: data),
              uploaded.publicId == intent.publicId,
              uploaded.deliveryType == purpose.deliveryType,
              let resultURL = URL(string: uploaded.secureURL),
              resultURL.scheme == "https",
              resultURL.host == "res.cloudinary.com" else {
            throw CloudinaryImageError.invalidServerResponse
        }
        return CloudinaryUploadedImage(
            publicId: uploaded.publicId,
            secureURL: purpose == .catalogItem ? uploaded.secureURL : nil
        )
    }

    private func multipartBody(jpeg: Data, intent: UploadIntent, boundary: String) -> Data {
        var body = Data()
        let fields = [
            ("api_key", intent.apiKey),
            ("timestamp", String(intent.timestamp)),
            ("signature", intent.signature),
            ("public_id", intent.publicId),
            ("type", intent.deliveryType),
            ("overwrite", "false")
        ]
        for (name, value) in fields {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpeg)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    private func backendRequest<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        let rawBaseURL = (Bundle.main.object(forInfoDictionaryKey: "RESHARE_IMAGE_API_BASE_URL") as? String)
            ?? "https://reshare-ios-capstone1-1.onrender.com"
        guard let baseURL = URL(string: rawBaseURL),
              baseURL.scheme == "https",
              baseURL.host != nil else {
            throw CloudinaryImageError.missingConfiguration
        }
        guard let user = Auth.auth().currentUser else { throw CloudinaryImageError.signedOut }
        let token = try await user.getIDToken(forcingRefresh: false)
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 120 // Render Free có thể khởi động lại sau thời gian không hoạt động.
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudinaryImageError.invalidServerResponse }
        guard (200...299).contains(http.statusCode) else { throw CloudinaryImageError.serverRejected(http.statusCode) }
        guard let decoded = try? JSONDecoder().decode(Response.self, from: data) else {
            throw CloudinaryImageError.invalidServerResponse
        }
        return decoded
    }

    private struct EmptyResponse: Decodable {}
}
