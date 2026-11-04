import Foundation
import FirebaseAuth

@MainActor
enum DonationResubmissionService {
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
        let raw = (Bundle.main.object(forInfoDictionaryKey: "RESHARE_IMAGE_API_BASE_URL") as? String)
            ?? "https://reshare-ios-capstone1-1.onrender.com"
        guard let baseURL = URL(string: raw), baseURL.scheme == "https", baseURL.host != nil else {
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
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw NSError(domain: "ReShare.DonationResubmit", code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: message ?? "Không gửi được thông tin bổ sung (HTTP \(http.statusCode))."])
        }
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any], payload["success"] as? Bool == true else {
            throw CloudinaryImageError.invalidServerResponse
        }
    }
}
