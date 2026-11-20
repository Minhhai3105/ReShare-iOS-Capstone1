import FirebaseAuth
import Foundation

@MainActor
enum CatalogListingDeletionService {
    private struct Response: Decodable {
        let deleted: Bool?
        let code: String?
    }

    private struct DeletionError: LocalizedError {
        let message: String
        nonisolated var errorDescription: String? { message }
    }

    static func delete(listingId: String, ownerId: String) async throws {
        guard let user = Auth.auth().currentUser, user.uid == ownerId else { throw CloudinaryImageError.signedOut }
        guard let baseURL = ReShareAPIConfiguration.configuredBaseURL() else {
            throw CloudinaryImageError.missingConfiguration
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/p2p/listings/\(listingId)/delete"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudinaryImageError.invalidServerResponse }
        let payload = try? JSONDecoder().decode(Response.self, from: data)
        if http.statusCode == 200, payload?.deleted == true { return }
        let message: String
        switch (http.statusCode, payload?.code) {
        case (401, _): message = "Vui lòng đăng nhập lại để xoá bài."
        case (403, "ACCOUNT_SUSPENDED"): message = "Tài khoản đang bị khoá nên chưa thể xoá bài."
        case (403, _): message = "Bạn không có quyền xoá bài này."
        case (404, "LISTING_NOT_FOUND"): message = "Bài đăng không còn trong Kho đồ 0đ."
        case (409, "HAS_RESERVATION"): message = "Món đồ đã có hẹn hoặc có xác nhận bàn giao nên không thể xoá."
        case (409, _): message = "Chỉ xoá được món còn ở trạng thái Sẵn sàng nhận đồ."
        default: message = "Chưa thể xoá bài lúc này. Vui lòng thử lại."
        }
        throw DeletionError(message: message)
    }
}
