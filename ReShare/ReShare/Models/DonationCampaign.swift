import SwiftUI

/// Model dữ liệu cho các Chiến dịch Quyên góp tập trung do Kho / Admin phát động
struct DonationCampaign: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let organizer: String
    let category: String
    let targetCount: Int
    let currentCount: Int
    let urgentLevel: UrgentLevel
    let daysLeft: Int
    let hubs: [String]
    let imageSystemName: String
    let description: String
    let acceptanceGuidelines: [String]

    enum UrgentLevel: String, CaseIterable {
        case urgent = "Khẩn cấp"
        case ongoing = "Đang diễn ra"
        case normal = "Mục tiêu tuần hoàn"

        var badgeColor: Color {
            switch self {
            case .urgent:
                return Color(red: 0.90, green: 0.25, blue: 0.20)
            case .ongoing:
                return Color(red: 0.20, green: 0.65, blue: 0.38)
            case .normal:
                return Color(red: 0.11, green: 0.35, blue: 0.20)
            }
        }
    }

    var progress: Double {
        guard targetCount > 0 else { return 0 }
        return min(Double(currentCount) / Double(targetCount), 1.0)
    }

    var progressPercentageString: String {
        return "\(Int(progress * 100))%"
    }
}

// MARK: - Dữ liệu minh hoạ, chưa phải chiến dịch tiếp nhận thật
extension DonationCampaign {
    static let mockCampaigns: [DonationCampaign] = [
        DonationCampaign(
            id: "camp-ao-am-2026",
            title: "Áo ấm mùa lũ miền Trung 2026",
            subtitle: "Quyên góp áo khoác dày, áo len, chăn mền cho bà con vùng trũng Hòa Vang",
            organizer: "ReShare (dữ liệu minh hoạ)",
            category: "Quần áo ấm",
            targetCount: 500,
            currentCount: 320,
            urgentLevel: .urgent,
            daysLeft: 8,
            hubs: [
                "Điểm mẫu Hải Châu (chưa hoạt động)",
                "Điểm mẫu Liên Chiểu (chưa hoạt động)"
            ],
            imageSystemName: "cloud.snow.fill",
            description: "Mùa mưa bão đang đến gần, nhiều hộ gia đình và trẻ em tại các xã vùng ven huyện Hòa Vang đang rất cần áo ấm, áo khoác gió chống nước và chăn mền để vượt qua đợt rét sắp tới. Mọi đóng góp của bạn sẽ được kiểm định, sấy khử khuẩn UV-C và chuyển tận tay bà con.",
            acceptanceGuidelines: [
                "Áo khoác gió, áo phao, áo len còn nguyên khóa kéo và khuy cài",
                "Chăn mền bông hoặc len sạch sẽ, không bị ẩm mốc",
                "Đồ đã được giặt sạch trước khi mang đến trạm",
                "Không nhận quần áo cộc tay, vải mỏng mùa hè trong chiến dịch này"
            ]
        ),
        DonationCampaign(
            id: "camp-sach-vo-2026",
            title: "Tủ sách tiếp bước sinh viên Hòa Khánh",
            subtitle: "Hỗ trợ giáo trình, sách chuyên ngành & tài liệu ôn thi cho tân sinh viên",
            organizer: "ReShare (dữ liệu minh hoạ)",
            category: "Sách vở",
            targetCount: 1000,
            currentCount: 780,
            urgentLevel: .ongoing,
            daysLeft: 15,
            hubs: [
                "Điểm mẫu Liên Chiểu (chưa hoạt động)",
                "Điểm mẫu Ngũ Hành Sơn (chưa hoạt động)"
            ],
            imageSystemName: "book.closed.fill",
            description: "Nhằm giảm gánh nặng chi phí mua giáo trình đầu năm học cho các bạn sinh viên có hoàn cảnh khó khăn tại khu vực Làng Đại học Đà Nẵng, chiến dịch tiếp nhận các bộ giáo trình Đại cương, Toán cao cấp, Lý, Hóa, Lập trình và sách ngoại ngữ còn nguyên vẹn.",
            acceptanceGuidelines: [
                "Giáo trình Đại học, Cao đẳng còn đủ trang, bìa chắc chắn",
                "Sách tham khảo, từ điển, tài liệu ôn thi IELTS/TOEIC",
                "Sách không bị rách nát, đã tẩy sạch vết chì thừa nếu có",
                "Có thể quyên góp kèm tập vở trắng mới chưa sử dụng"
            ]
        ),
        DonationCampaign(
            id: "camp-thiet-bi-hoc-tap-2026",
            title: "Máy tính cũ - Tri thức mới cho em",
            subtitle: "Tiếp nhận máy tính bảng, laptop cũ còn dùng tốt để tân trang cho học sinh",
            organizer: "ReShare (dữ liệu minh hoạ)",
            category: "Đồ điện tử",
            targetCount: 50,
            currentCount: 34,
            urgentLevel: .urgent,
            daysLeft: 12,
            hubs: [
                "Điểm mẫu Hải Châu (chưa hoạt động)"
            ],
            imageSystemName: "laptopcomputer.and.iphone",
            description: "Đội ngũ kỹ thuật viên tình nguyện của ReShare sẽ vệ sinh, cài đặt hệ điều hành nhẹ và thay thế linh kiện cơ bản để biến những chiếc laptop, máy tính bảng bạn không còn dùng tới thành công cụ học trực tuyến đắc lực cho các em học sinh hiếu học.",
            acceptanceGuidelines: [
                "Laptop hoặc máy tính bảng còn lên nguồn và màn hình hiển thị tốt",
                "Kèm theo dây sạc / adapter nguồn nếu còn",
                "Kỹ thuật viên sẽ hỗ trợ xóa sạch dữ liệu cá nhân trước mặt bạn tại trạm",
                "Chấp nhận cả máy tính để bàn (PC) cấu hình văn phòng"
            ]
        ),
        DonationCampaign(
            id: "camp-bep-am-2026",
            title: "Bếp ấm yêu thương cho xóm trọ công nhân",
            subtitle: "Quyên góp nồi cơm điện, ấm đun, bát đĩa sạch cho công nhân KCN Hòa Khánh",
            organizer: "ReShare (dữ liệu minh hoạ)",
            category: "Gia dụng",
            targetCount: 200,
            currentCount: 145,
            urgentLevel: .normal,
            daysLeft: 20,
            hubs: [
                "Điểm mẫu Liên Chiểu (chưa hoạt động)"
            ],
            imageSystemName: "cooktop.fill",
            description: "Nhiều anh chị em công nhân trẻ mới đến Đà Nẵng làm việc tại KCN Hòa Khánh còn thiếu thốn đồ dùng nhà bếp thiết yếu. Hãy gửi lại những món đồ gia dụng thừa trong gia đình bạn để sưởi ấm những gian bếp trọ.",
            acceptanceGuidelines: [
                "Nồi cơm điện, quạt bàn, ấm siêu tốc hoạt động an toàn, không hở điện",
                "Bát đĩa, xoong chảo bằng sứ hoặc inox không sứt mẻ",
                "Đã được rửa sạch dầu mỡ trước khi mang đến trạm"
            ]
        )
    ]
}
