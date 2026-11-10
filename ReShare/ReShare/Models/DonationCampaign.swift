import SwiftUI

/// Chiến dịch quyên góp do System Admin phát động trên Web Admin, đọc từ Firestore (`campaigns`).
/// Dữ liệu gốc nằm trong `record` (Core/CampaignRecord.swift); struct này chỉ thêm phần hiển thị.
struct DonationCampaign: Identifiable, Hashable {
    let record: CampaignRecord

    init(record: CampaignRecord) {
        self.record = record
    }

    var id: String { record.id }
    var title: String { record.title }
    var subtitle: String { record.summary }
    var organizer: String { record.organizer }
    var description: String { record.story }
    var acceptanceGuidelines: [String] { record.guidelines }
    /// Tên các điểm tiếp nhận để hiển thị; mã Hub nằm ở `hubIds`.
    var hubs: [String] { record.hubs.map(\.name) }
    var hubIds: [String] { record.hubs.map(\.id) }
    var donationCategory: DonationCategory { DonationCategory(rawValue: record.categoryId) ?? .clothing }
    var categoryTitle: String { donationCategory.title }
    var urgentLevel: UrgentLevel { record.urgent ? .urgent : .ongoing }
    var daysLeft: Int { record.daysLeft() }
    var progress: Double { record.progress }
    var progressPercentageString: String { "\(Int(progress * 100))%" }
    var unitTitle: String { DonationUnit(rawValue: record.unitId)?.title ?? record.unitId }
    var receivedDonationCount: Int { record.receivedDonationCount }
    var isAcceptingDonations: Bool { record.isAcceptingDonations() }

    /// Ví dụ "3/10 chiếc" — số đã NHẬP KHO, không phải số donor khai báo.
    var progressText: String {
        "\(Self.format(record.receivedQuantity))/\(Self.format(record.targetQuantity)) \(unitTitle)"
    }
    var receivedText: String { "\(Self.format(record.receivedQuantity)) \(unitTitle)" }
    var targetText: String { "\(Self.format(record.targetQuantity)) \(unitTitle)" }

    var daysLeftText: String {
        daysLeft == 0 ? "Hôm nay là ngày cuối" : "Còn \(daysLeft) ngày"
    }

    var imageSystemName: String {
        switch donationCategory {
        case .clothing: return "tshirt.fill"
        case .books: return "book.closed.fill"
        case .household: return "cooktop.fill"
        }
    }

    enum UrgentLevel: String, CaseIterable {
        case urgent = "Khẩn cấp"
        case ongoing = "Đang tiếp nhận"

        var badgeColor: Color {
            switch self {
            case .urgent:
                return Color(red: 0.90, green: 0.25, blue: 0.20)
            case .ongoing:
                return Color(red: 0.20, green: 0.65, blue: 0.38)
            }
        }
    }

    private static func format(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.maximumFractionDigits = 3
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

#if DEBUG
// MARK: - Chỉ dùng cho #Preview của Xcode, không bao giờ hiển thị trong app
extension DonationCampaign {
    static let previewSample: DonationCampaign = {
        let record = CampaignRecord(id: "preview", data: [
            "title": "Chiến dịch xem trước", "summary": "Dữ liệu chỉ dùng trong Xcode Preview",
            "organizer": "Xem trước", "category": "clothing", "unitId": "piece",
            "targetQuantity": 100, "receivedQuantity": 30, "receivedDonationCount": 12, "urgent": true,
            "endDate": Date().addingTimeInterval(10 * 86_400), "status": "active",
            "hubs": [["id": "hub-preview", "name": "Điểm xem trước"]], "guidelines": ["Đồ đã giặt sạch"],
        ])!
        return DonationCampaign(record: record)
    }()
}
#endif
