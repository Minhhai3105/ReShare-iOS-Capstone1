import SwiftUI

/// Thẻ mở danh sách điểm tiếp nhận minh hoạ tại Đà Nẵng
struct NearbyHubHomeCard: View {
    var onAction: () -> Void = {}

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
                        Text("Điểm tiếp nhận mẫu")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Text("Demo")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.12))
                        .clipShape(Capsule())
                    }

                    Text("Chưa có trạm nhận đồ thật tại Đà Nẵng")
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
