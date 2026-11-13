import SwiftUI

/// Thẻ mở danh sách điểm tiếp nhận. Nội dung theo dữ liệu `hubs` (cờ isDemo), không gõ cứng "demo".
struct NearbyHubHomeCard: View {
    /// Điểm đang hoạt động đọc từ Firestore; nil khi chưa tải được.
    var hubs: [HubRecord]? = nil
    var onAction: () -> Void = {}

    private var realCount: Int { hubs?.filter { !$0.isDemo }.count ?? 0 }
    private var isAllDemo: Bool { guard let hubs, !hubs.isEmpty else { return false }; return realCount == 0 }

    private var subtitle: String {
        guard let hubs else { return "Xem các điểm nhận đồ quyên góp" }
        if hubs.isEmpty { return "Chưa có điểm tiếp nhận nào" }
        if isAllDemo { return "Các điểm đang minh hoạ, chưa nhận đồ thật" }
        return "\(realCount) điểm đang nhận đồ"
    }

    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)

    var body: some View {
        Button(action: onAction) {
            HStack(spacing: 12) {
                // Icon trạm tiếp nhận có vòng tròn xanh
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(softMint)
                        .frame(width: 44, height: 44)

                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(primaryGreen)
                }

                // Thông tin trạm
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("Điểm tiếp nhận")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        if isAllDemo {
                            Text("Minh hoạ")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.orange)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.12))
                            .clipShape(Capsule())
                        }
                    }

                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(uiColor: .tertiaryLabel))
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white)
                    .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, 20)
    }
}

#Preview {
    NearbyHubHomeCard()
        .padding(.vertical)
        .background(Color(red: 0.97, green: 0.98, blue: 0.96))
}
