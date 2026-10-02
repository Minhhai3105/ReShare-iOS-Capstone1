import SwiftUI

/// Thẻ Widget hiển thị Chiến dịch Quyên góp khẩn cấp trên Trang chủ
struct UrgentCampaignHomeCard: View {
    let campaign: DonationCampaign
    var onAction: () -> Void = {}

    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)

    var body: some View {
        Button(action: onAction) {
            VStack(alignment: .leading, spacing: 10) {
                // Header của card: Badge khẩn cấp & Thời gian còn lại
                HStack {
                    HStack(spacing: 4) {
                        Text("🔥")
                            .font(.system(size: 11))
                        Text("CHIẾN DỊCH MẪU TẠI ĐÀ NẴNG")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.85, green: 0.20, blue: 0.15))
                    }

                    Spacer()

                    Text("Dữ liệu demo")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(uiColor: .systemGray6))
                        .clipShape(Capsule())
                }

                // Nội dung chiến dịch
                HStack(alignment: .center, spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(red: 0.90, green: 0.94, blue: 0.88))
                            .frame(width: 44, height: 44)
                        Image(systemName: campaign.imageSystemName)
                            .font(.system(size: 22))
                            .foregroundColor(primaryGreen)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(campaign.title)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Text(campaign.subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()
                }

                // Thanh tiến độ %
                VStack(spacing: 4) {
                    HStack {
                        Text("Tiến độ minh hoạ: \(campaign.currentCount)/\(campaign.targetCount) món")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(primaryGreen)

                        Spacer()

                        Text(campaign.progressPercentageString)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(primaryGreen)
                    }

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color(red: 0.90, green: 0.93, blue: 0.88))
                                .frame(height: 6)

                            RoundedRectangle(cornerRadius: 4)
                                .fill(
                                    LinearGradient(
                                        colors: [mintGreen, primaryGreen],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: max(geo.size.width * CGFloat(campaign.progress), 8), height: 6)
                        }
                    }
                    .frame(height: 6)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color.white)
                    .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, 20)
    }
}

#Preview {
    UrgentCampaignHomeCard(campaign: DonationCampaign.mockCampaigns[0])
        .padding(.vertical)
        .background(Color(red: 0.97, green: 0.98, blue: 0.96))
}
