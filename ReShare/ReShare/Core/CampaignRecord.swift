import Foundation

/// Bản ghi chiến dịch đọc từ Firestore (collection `campaigns`), không phụ thuộc SwiftUI/Firebase
/// để kiểm thử được bằng `swift test`. FirestoreService đổi Timestamp sang Date trước khi parse.
/// Chiến dịch chỉ do backend ghi; tiến độ (`receivedQuantity`) chỉ tăng khi hàng đã nhập kho.
struct CampaignRecord: Hashable {
    struct HubRef: Hashable {
        let id: String
        let name: String
    }

    let id: String
    let title: String
    let summary: String
    let story: String
    let organizer: String
    /// Mã danh mục trùng DonationCategory: clothing / books / household.
    let categoryId: String
    let unitId: String
    let targetQuantity: Double
    let receivedQuantity: Double
    let receivedDonationCount: Int
    let urgent: Bool
    let endDate: Date
    let hubs: [HubRef]
    let guidelines: [String]
    let status: String

    static let categories: Set<String> = ["clothing", "books", "household"]
    static let units: Set<String> = ["piece", "kg", "bag", "box", "set"]

    /// Trả nil khi thiếu field bắt buộc hoặc sai kiểu: app bỏ qua bản ghi hỏng thay vì hiện số sai.
    init?(id: String, data: [String: Any]) {
        guard let title = (data["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
              let categoryId = data["category"] as? String, Self.categories.contains(categoryId),
              let unitId = data["unitId"] as? String, Self.units.contains(unitId),
              let target = Self.number(data["targetQuantity"]), target > 0,
              let endDate = data["endDate"] as? Date,
              let status = data["status"] as? String else { return nil }
        self.id = id
        self.title = title
        self.summary = data["summary"] as? String ?? ""
        self.story = data["description"] as? String ?? ""
        self.organizer = data["organizer"] as? String ?? ""
        self.categoryId = categoryId
        self.unitId = unitId
        self.targetQuantity = target
        self.receivedQuantity = max(Self.number(data["receivedQuantity"]) ?? 0, 0)
        self.receivedDonationCount = max(Int(Self.number(data["receivedDonationCount"]) ?? 0), 0)
        self.urgent = data["urgent"] as? Bool ?? false
        self.endDate = endDate
        self.hubs = (data["hubs"] as? [[String: Any]] ?? []).compactMap { raw in
            guard let hubId = raw["id"] as? String, !hubId.isEmpty else { return nil }
            return HubRef(id: hubId, name: (raw["name"] as? String) ?? hubId)
        }
        self.guidelines = (data["guidelines"] as? [String] ?? []).filter { !$0.isEmpty }
        self.status = status
    }

    /// Còn nhận đơn: đang mở và chưa quá ngày kết thúc (khớp điều kiện trong firestore.rules).
    func isAcceptingDonations(now: Date = Date()) -> Bool {
        status == "active" && endDate > now
    }

    /// Tỉ lệ 0...1 cho thanh tiến độ.
    var progress: Double {
        guard targetQuantity > 0 else { return 0 }
        return min(max(receivedQuantity / targetQuantity, 0), 1)
    }

    /// Số ngày còn lại tính theo ngày lịch giờ Việt Nam; 0 nghĩa là hôm nay là ngày cuối.
    func daysLeft(now: Date = Date()) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current
        let start = calendar.startOfDay(for: now)
        let end = calendar.startOfDay(for: endDate)
        return max(calendar.dateComponents([.day], from: start, to: end).day ?? 0, 0)
    }

    /// Danh sách hiển thị: chiến dịch còn nhận đơn, khẩn cấp lên trước, rồi sắp hết hạn lên trước.
    static func openForDisplay(_ records: [CampaignRecord], now: Date = Date()) -> [CampaignRecord] {
        records
            .filter { $0.isAcceptingDonations(now: now) }
            .sorted { lhs, rhs in
                if lhs.urgent != rhs.urgent { return lhs.urgent }
                if lhs.endDate != rhs.endDate { return lhs.endDate < rhs.endDate }
                return lhs.id < rhs.id
            }
    }

    /// Firestore trả số dưới dạng NSNumber; boolean cũng là NSNumber nên phải loại riêng,
    /// nếu không `true` sẽ thành 1.
    private static func number(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        return double.isFinite ? double : nil
    }
}

/// Điểm tiếp nhận đọc từ collection `hubs` (nạp bằng backend/scripts/seed-hubs.cjs).
struct HubRecord: Hashable, Identifiable {
    let id: String
    let name: String
    let address: String
    let latitude: Double
    let longitude: Double
    let openHours: String
    /// true: điểm minh hoạ, chưa tiếp nhận đồ thật — app phải nói rõ điều này.
    let isDemo: Bool

    init?(id: String, data: [String: Any]) {
        guard let name = data["name"] as? String, !name.isEmpty,
              (data["status"] as? String) == "active",
              let latitude = (data["latitude"] as? NSNumber)?.doubleValue, (-90...90).contains(latitude),
              let longitude = (data["longitude"] as? NSNumber)?.doubleValue, (-180...180).contains(longitude) else { return nil }
        self.id = id
        self.name = name
        self.address = data["address"] as? String ?? ""
        self.latitude = latitude
        self.longitude = longitude
        self.openHours = data["openHours"] as? String ?? ""
        // Thiếu cờ thì coi như minh hoạ: thà nói thiếu còn hơn để người dùng mang đồ tới điểm không có người nhận.
        self.isDemo = data["isDemo"] as? Bool ?? true
    }
}
