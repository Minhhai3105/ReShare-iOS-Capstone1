import Foundation
import FirebaseAuth

@MainActor
enum DonationCancellationService {
    private struct Request: Encodable {
        let expectedVersion: Int
    }

    private struct Response: Decodable {
        let success: Bool?
        let code: String?
    }

    private struct CancellationError: LocalizedError {
        let message: String
        nonisolated var errorDescription: String? { message }
    }

    static func cancel(donationId: String, expectedVersion: Int) async throws {
        guard let user = Auth.auth().currentUser else { throw CloudinaryImageError.signedOut }
        guard let baseURL = ReShareAPIConfiguration.configuredBaseURL() else {
            throw CloudinaryImageError.missingConfiguration
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/donations/\(donationId)/cancel"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Request(expectedVersion: expectedVersion))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudinaryImageError.invalidServerResponse }
        let payload = try? JSONDecoder().decode(Response.self, from: data)
        guard http.statusCode == 200, payload?.success == true else {
            let message: String
            switch (http.statusCode, payload?.code) {
            case (401, _): message = "Vui lòng đăng nhập lại để huỷ đơn."
            case (403, _): message = "Bạn không có quyền huỷ đơn này."
            case (404, _): message = "Không tìm thấy đơn quyên góp. Hãy tải lại danh sách."
            case (409, "NOT_CANCELLABLE"): message = "Đơn không còn ở trạng thái có thể huỷ. Hãy tải lại danh sách."
            case (409, _): message = "Đơn đã thay đổi. Hãy tải lại danh sách trước khi thử lại."
            default: message = "Không thể huỷ đơn lúc này. Vui lòng thử lại."
            }
            throw CancellationError(message: message)
        }
    }
}
