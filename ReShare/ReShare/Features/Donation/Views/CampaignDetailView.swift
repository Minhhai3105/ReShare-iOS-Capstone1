import SwiftUI

/// Màn hình Chi tiết Chiến dịch Quyên góp (Hiển thị tiêu chuẩn nhận đồ & Nút mở Camera)
struct CampaignDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let campaign: DonationCampaign

    @State private var showCameraView: Bool = false
    // Thông tin Hub (địa chỉ, giờ, cờ minh hoạ) đọc từ Firestore theo mã Hub của chiến dịch
    @State private var hubDetails: [String: HubRecord] = [:]
    @State private var didLoadHubs: Bool = false

    /// Còn Hub nào của chiến dịch ở chế độ minh hoạ (hoặc chưa tải được) thì phải nói rõ.
    private var hasDemoHub: Bool {
        campaign.hubIds.contains { hubDetails[$0]?.isDemo ?? true }
    }

    // Màu sắc nhận diện ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 20) {
                if didLoadHubs && hasDemoHub {
                    Text("ĐIỂM TIẾP NHẬN ĐANG MINH HOẠ — ĐƠN ĐƯỢC LƯU THẬT NHƯNG CHƯA MANG ĐỒ TỚI ĐIỂM NÀY")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // 1. Hero Card Banner & Huy hiệu khẩn cấp
                heroBannerSection

                // 2. Tiêu đề & Thông tin đơn vị tổ chức
                titleAndOrganizerSection

                // 3. Thanh tiến độ chiến dịch (% Đã đạt)
                campaignProgressCard

                // 4. Ý nghĩa & Hoàn cảnh kêu gọi
                descriptionCard

                // 5. Tiêu chuẩn tiếp nhận của Kho (Acceptance Guidelines)
                acceptanceGuidelinesCard

                // 6. Danh sách Trạm tiếp nhận tại Đà Nẵng
                participatingHubsCard
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 110) // Đệm để không bị che bởi sticky bottom CTA
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white))
                        .shadow(color: Color.black.opacity(0.06), radius: 4)
                }
            }

        }
        .task { await loadHubDetails() }
        // Thanh dính đáy kích hoạt Camera quyên góp
        .safeAreaInset(edge: .bottom) {
            stickyBottomActionBar
        }
        // Mở Camera kiểm định 3-6 ảnh
        .fullScreenCover(isPresented: $showCameraView) {
            NavigationStack {
                DonationCameraView(
                    onFinishCapturing: nil,
                    onBackToHome: {
                        showCameraView = false
                    },
                    campaign: campaign
                )
            }
        }
    }

    // MARK: - Hub của chiến dịch
    private func loadHubDetails() async {
        if let hubs = try? await FirestoreService.shared.fetchActiveHubs() {
            hubDetails = Dictionary(uniqueKeysWithValues: hubs.map { ($0.id, $0) })
        }
        didLoadHubs = true
    }

    private func hubSubtitle(for hubId: String) -> String {
        guard didLoadHubs else { return "Đang tải thông tin điểm tiếp nhận…" }
        guard let hub = hubDetails[hubId] else { return "Điểm này đã ngừng hoạt động" }
        if hub.isDemo { return "Điểm minh hoạ — chưa tiếp nhận đồ thật" }
        return [hub.address, hub.openHours].filter { !$0.isEmpty }.joined(separator: " • ")
    }

    // MARK: - 1. Hero Banner
    private var heroBannerSection: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 22)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.15, green: 0.40, blue: 0.25), Color(red: 0.08, green: 0.28, blue: 0.16)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(height: 180)

            // Icon minh họa lớn chìm
            Image(systemName: campaign.imageSystemName)
                .font(.system(size: 90))
                .foregroundColor(.white.opacity(0.12))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(16)

            VStack(alignment: .leading, spacing: 12) {
                // Huy hiệu mức độ khẩn cấp & Thời gian còn lại
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(campaign.urgentLevel.badgeColor)
                            .frame(width: 7, height: 7)
                        Text(campaign.urgentLevel.rawValue)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(campaign.urgentLevel.badgeColor)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.white)
                    .clipShape(Capsule())

                    Text(campaign.daysLeftText)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.2))
                        .clipShape(Capsule())

                    Spacer()
                }

                Spacer()

                // Thẻ danh mục
                Text(campaign.categoryTitle)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(red: 0.08, green: 0.35, blue: 0.18))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color(red: 0.55, green: 0.92, blue: 0.70))
                    .clipShape(Capsule())
            }
            .padding(16)
        }
    }

    // MARK: - 2. Title & Organizer
    private var titleAndOrganizerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(campaign.title)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.primary)

            Text(campaign.subtitle)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .lineSpacing(2)

            HStack(spacing: 6) {
                Image(systemName: "building.2.fill")
                    .font(.system(size: 12))
                    .foregroundColor(mintGreen)
                Text(campaign.organizer)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 3. Progress Card
    private var campaignProgressCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TIẾN ĐỘ (ĐỒ ĐÃ NHẬP KHO)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)

                Spacer()

                Text(campaign.progressPercentageString)
                    .font(.system(size: 16, weight: .black))
                    .foregroundColor(primaryGreen)
            }

            // Thanh Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(red: 0.90, green: 0.93, blue: 0.88))
                        .frame(height: 12)

                    RoundedRectangle(cornerRadius: 8)
                        .fill(
                            LinearGradient(
                                colors: [mintGreen, primaryGreen],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(geo.size.width * CGFloat(campaign.progress), 14), height: 12)
                }
            }
            .frame(height: 12)

            HStack {
                Text("Đã nhập kho: \(campaign.receivedText)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(primaryGreen)

                Spacer()

                Text("Mục tiêu: \(campaign.targetText)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
            }

            Text("\(campaign.receivedDonationCount) lượt quyên góp đã vào kho. Số lượng bạn khai báo chỉ được cộng sau khi kho kiểm đếm thực tế.")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 4. Description Card
    private var descriptionCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("VỀ CHIẾN DỊCH NÀY")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)

            Text(campaign.description.isEmpty ? campaign.subtitle : campaign.description)
                .font(.system(size: 13))
                .foregroundColor(.primary.opacity(0.85))
                .lineSpacing(4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 5. Acceptance Guidelines Card
    private var acceptanceGuidelinesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundColor(mintGreen)
                Text("TIÊU CHUẨN ĐỒ ĐƯỢC TIẾP NHẬN")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                ForEach(campaign.acceptanceGuidelines, id: \.self) { rule in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(mintGreen)
                            .padding(.top, 1)

                        Text(rule)
                            .font(.system(size: 12))
                            .foregroundColor(.primary)
                            .lineSpacing(2)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 6. Participating Hubs
    private var participatingHubsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ĐIỂM TIẾP NHẬN CỦA CHIẾN DỊCH")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)

            ForEach(Array(zip(campaign.hubIds, campaign.hubs)), id: \.0) { hubId, hubName in
                HStack(spacing: 10) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(primaryGreen)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(hubName)
                            .font(.system(size: 13, weight: .bold))
                        Text(hubSubtitle(for: hubId))
                            .font(.system(size: 11))
                            .foregroundColor(hubDetails[hubId]?.isDemo == false ? .secondary : .orange)
                    }

                    Spacer()
                }
                .padding(10)
                .background(softMint.opacity(0.6))
                .cornerRadius(12)
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 7. Sticky Bottom CTA Bar
    private var stickyBottomActionBar: some View {
        VStack(spacing: 6) {
            Button(action: {
                showCameraView = true
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 16, weight: .bold))
                    Text(campaign.isAcceptingDonations ? "Chụp ảnh và gửi đồ cho chiến dịch" : "Chiến dịch đã ngừng nhận đơn")
                        .font(.system(size: 16, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(campaign.isAcceptingDonations ? primaryGreen : Color.gray)
                .foregroundColor(.white)
                .cornerRadius(16)
                .shadow(color: primaryGreen.opacity(0.35), radius: 8, y: 4)
            }
            .disabled(!campaign.isAcceptingDonations)

            Text(hasDemoHub
                 ? "Đơn được lưu thật và kho sẽ duyệt; điểm tiếp nhận đang minh hoạ nên chưa mang đồ tới."
                 : "Kho duyệt đơn trước, sau đó bạn mang đồ tới điểm tiếp nhận đã chọn.")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 14)
        .background(
            Color.white
                .shadow(color: Color.black.opacity(0.06), radius: 8, y: -4)
                .ignoresSafeArea(edges: .bottom)
        )
    }
}

#Preview {
    NavigationStack {
        CampaignDetailView(campaign: DonationCampaign.previewSample)
    }
}
