import SwiftUI

/// Màn hình Trung tâm Chiến dịch Quyên góp (Campaigns Hub - Tab 3 của ứng dụng)
struct DonationCampaignsView: View {
    @State private var selectedFilter: String = "Tất cả"
    // Chiến dịch thật đọc từ Firestore (System Admin mở trên Web Admin)
    @State private var campaigns: [DonationCampaign] = []
    @State private var isLoading: Bool = true
    @State private var loadError: String? = nil

    // State mở Camera quyên góp tự do (không theo chiến dịch)
    @State private var showFreeDonationCamera: Bool = false

    // State chọn chiến dịch để mở chi tiết
    @State private var selectedCampaign: DonationCampaign? = nil

    // Bộ lọc danh mục
    private let filters = ["Tất cả", "🔥 Khẩn cấp", "👕 Quần áo", "📚 Sách vở", "🪑 Gia dụng"]

    // Màu sắc nhận diện ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)

    // Danh sách chiến dịch sau khi lọc
    private var filteredCampaigns: [DonationCampaign] {
        if selectedFilter == "Tất cả" {
            return campaigns
        } else if selectedFilter == "🔥 Khẩn cấp" {
            return campaigns.filter { $0.urgentLevel == .urgent }
        } else if selectedFilter == "👕 Quần áo" {
            return campaigns.filter { $0.donationCategory == .clothing }
        } else if selectedFilter == "📚 Sách vở" {
            return campaigns.filter { $0.donationCategory == .books }
        } else if selectedFilter == "🪑 Gia dụng" {
            return campaigns.filter { $0.donationCategory == .household }
        }
        return campaigns
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 18) {
                // 1. Top Header (Đã gỡ bỏ chiếc chuông thừa)
                topHeaderSection

                // 2. Dải bộ lọc danh mục & mức độ khẩn cấp
                categoryFilterSection

                if isLoading && campaigns.isEmpty {
                    campaignStateView(icon: nil, message: "Đang tải chiến dịch…")
                } else if let loadError, campaigns.isEmpty {
                    campaignStateView(icon: "wifi.exclamationmark", message: loadError, showsRetry: true)
                } else if campaigns.isEmpty {
                    campaignStateView(
                        icon: "megaphone",
                        message: "Hiện chưa có chiến dịch nào đang tiếp nhận. Bạn vẫn có thể quyên góp tự do ở bên dưới."
                    )
                } else {
                    // 3. Spotlight Card: Chiến dịch khẩn cấp nhất (nếu có)
                    if let spotlight = campaigns.first(where: { $0.urgentLevel == .urgent }) {
                        spotlightCard(for: spotlight)
                    }

                    // 4. Danh sách các chiến dịch đang tiếp nhận
                    activeCampaignsListSection
                }

                // 5. Nút quyên góp tự do (Không theo chiến dịch)
                freeDonationOptionBanner
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarHidden(true)
        .task { await loadCampaigns() }
        .refreshable { await loadCampaigns() }
        // Sheet mở chi tiết chiến dịch
        .sheet(item: $selectedCampaign) { camp in
            NavigationStack {
                CampaignDetailView(campaign: camp)
            }
        }
        // Mở Camera cho luồng Quyên góp tự do (Sửa lỗi đứt đoạn: để Camera tự đẩy sang DonationDetailsView & SuccessView)
        .fullScreenCover(isPresented: $showFreeDonationCamera) {
            NavigationStack {
                DonationCameraView(
                    onFinishCapturing: nil,
                    onBackToHome: {
                        showFreeDonationCamera = false
                    }
                )
            }
        }
    }

    // MARK: - Tải dữ liệu & trạng thái rỗng/lỗi
    private func loadCampaigns() async {
        isLoading = true
        do {
            campaigns = try await FirestoreService.shared.fetchOpenCampaigns()
            loadError = nil
        } catch {
            loadError = "Không tải được chiến dịch. Kiểm tra kết nối rồi kéo xuống để thử lại."
        }
        isLoading = false
    }

    private func campaignStateView(icon: String?, message: String, showsRetry: Bool = false) -> some View {
        VStack(spacing: 12) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(primaryGreen)
            } else {
                ProgressView()
            }
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            if showsRetry {
                Button("Thử lại") {
                    Task { await loadCampaigns() }
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(primaryGreen)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Color.white)
        .cornerRadius(18)
    }

    // MARK: - 1. Top Header (Đã bỏ chiếc chuông thừa)
    private var topHeaderSection: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Chiến dịch Quyên góp")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(primaryGreen)

                Text("Tiến độ chỉ tính đồ đã được kho tiếp nhận")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
    }

    // MARK: - 2. Filter Section
    private var categoryFilterSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(filters, id: \.self) { filter in
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedFilter = filter
                        }
                    }) {
                        Text(filter)
                            .font(.system(size: 13, weight: selectedFilter == filter ? .bold : .medium))
                            .foregroundColor(selectedFilter == filter ? .white : Color.primary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(selectedFilter == filter ? primaryGreen : Color.white)
                            )
                            .shadow(color: Color.black.opacity(selectedFilter == filter ? 0.1 : 0.03), radius: 4)
                    }
                }
            }
        }
    }

    // MARK: - 3. Spotlight Hero Card
    private func spotlightCard(for camp: DonationCampaign) -> some View {
        Button(action: {
            selectedCampaign = camp
        }) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.12, green: 0.36, blue: 0.22), Color(red: 0.06, green: 0.22, blue: 0.13)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(height: 180)

                // Icon trang trí lớn
                Image(systemName: camp.imageSystemName)
                    .font(.system(size: 96))
                    .foregroundColor(.white.opacity(0.10))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(14)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        HStack(spacing: 4) {
                            Circle().fill(camp.urgentLevel.badgeColor).frame(width: 6, height: 6)
                            Text(camp.urgentLevel.rawValue)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(camp.urgentLevel.badgeColor)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white)
                        .clipShape(Capsule())

                        Text("⏰ \(camp.daysLeftText)")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.2))
                            .clipShape(Capsule())

                        Spacer()
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(camp.title)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        Text(camp.subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.85))
                            .lineLimit(2)
                    }

                    // Tiến độ
                    VStack(spacing: 4) {
                        HStack {
                            Text("Đã nhập kho: \(camp.progressText)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white.opacity(0.9))
                            Spacer()
                            Text(camp.progressPercentageString)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(Color(red: 0.55, green: 0.92, blue: 0.70))
                        }

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.white.opacity(0.25))
                                    .frame(height: 6)
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(red: 0.55, green: 0.92, blue: 0.70))
                                    .frame(width: max(geo.size.width * CGFloat(camp.progress), 8), height: 6)
                            }
                        }
                        .frame(height: 6)
                    }
                }
                .padding(16)
            }
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - 4. Active Campaigns List
    private var activeCampaignsListSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("CHIẾN DỊCH ĐANG TIẾP NHẬN (\(filteredCampaigns.count))")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
            }

            LazyVStack(spacing: 12) {
                ForEach(filteredCampaigns) { camp in
                    Button(action: {
                        selectedCampaign = camp
                    }) {
                        campaignCardView(for: camp)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
    }

    private func campaignCardView(for camp: DonationCampaign) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(red: 0.92, green: 0.95, blue: 0.90))
                        .frame(width: 50, height: 50)
                    Image(systemName: camp.imageSystemName)
                        .font(.system(size: 24))
                        .foregroundColor(primaryGreen)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(camp.title)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Spacer()

                        Text(camp.daysLeftText)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.secondary)
                    }

                    Text(camp.subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }

            // Tiến độ thanh ngang
            VStack(spacing: 4) {
                HStack {
                    Text("\(camp.categoryTitle) • Tiếp nhận tại \(camp.hubs.count) điểm")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)

                    Spacer()

                    Text("\(camp.progressText) (\(camp.progressPercentageString))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(primaryGreen)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(red: 0.90, green: 0.93, blue: 0.88))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(mintGreen)
                            .frame(width: max(geo.size.width * CGFloat(camp.progress), 8), height: 6)
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 5. Free Donation Option Banner
    private var freeDonationOptionBanner: some View {
        Button(action: {
            showFreeDonationCamera = true
        }) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(softMint)
                        .frame(width: 44, height: 44)
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 20))
                        .foregroundColor(primaryGreen)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Quyên góp đồ dùng khác (Tự do)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(primaryGreen)
                    Text("Bạn có đồ dùng ngoài các chiến dịch trên? Bấm vào đây để chụp ảnh gửi kiểm định về Kho tổng ReShare.")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding(14)
            .background(Color.white)
            .cornerRadius(18)
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(primaryGreen.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    NavigationStack {
        DonationCampaignsView()
    }
}
