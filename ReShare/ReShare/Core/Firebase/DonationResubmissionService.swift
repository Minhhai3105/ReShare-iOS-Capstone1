import Foundation
import FirebaseAuth

@MainActor
enum DonationResubmissionService {
    struct APIError: LocalizedError {
        let status: Int
        let code: String?
        let message: String
        nonisolated var errorDescription: String? { message }
    }

    struct Request: Encodable {
        let title: String
        let description: String
        let category: String
        let condition: String
        let quantity: Double
        let unitId: String
        let expectedVersion: Int
        let idempotencyKey: String
        let imagePublicIds: [String]?
        let imageUploadRecordId: String?
    }

    static func submit(donationId: String, request body: Request) async throws {
        guard let user = Auth.auth().currentUser else { throw CloudinaryImageError.signedOut }
        guard let baseURL = ReShareAPIConfiguration.configuredBaseURL() else {
            throw CloudinaryImageError.missingConfiguration
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/donations/\(donationId)/resubmit"))
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudinaryImageError.invalidServerResponse }
        guard (200...299).contains(http.statusCode) else {
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw APIError(status: http.statusCode, code: payload?["code"] as? String,
                message: payload?["message"] as? String ?? "Không gửi được thông tin bổ sung (HTTP \(http.statusCode)).")
        }
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any], payload["success"] as? Bool == true else {
            throw CloudinaryImageError.invalidServerResponse
        }
    }
}
