import SwiftUI

/// Màn hình Trang chủ trung tâm (Control Center) của ReShare tại Đà Nẵng
struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @State private var recentItems: [DonationItem] = []
    
    // State quản lý việc mở Camera và nhận ảnh chụp
    @State private var showCamera: Bool = false
    @State private var showProfileSheet: Bool = false
    @State private var showHistorySheet: Bool = false
    @State private var showHubsSheet: Bool = false
    @State private var selectedCampaignForDetail: DonationCampaign? = nil
    @State private var capturedImage: UIImage? = nil
    
    // Tên hiển thị người dùng động từ Auth/Profile
    private var greetingName: String {
        if let name = appState.currentUserProfile?.displayName, !name.isEmpty {
            return name
        }
        if let authName = AuthService.shared.currentDisplayName, !authName.isEmpty {
            return authName
        }
        if let emailName = AuthService.shared.currentEmail?.components(separatedBy: "@").first, !emailName.isEmpty {
            return emailName
        }
        return "bạn"
    }
    
    // Chiến dịch khẩn cấp nhất tại Đà Nẵng
    private var urgentCampaign: DonationCampaign? {
        DonationCampaign.mockCampaigns.first(where: { $0.urgentLevel == .urgent })
    }
    
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                // 1. Header Lời chào & Avatar mở Hồ sơ
                HomeGreetingHeader(
                    userName: greetingName,
                    onAvatarTap: {
                        showProfileSheet = true
                    }
                )
                
                // 2. Mở danh sách điểm tiếp nhận mẫu (chưa có trạm hoạt động)
                NearbyHubHomeCard(
                    onAction: {
                        showHubsSheet = true
                    }
                )
                
                // 3. Nút kêu gọi Quyên góp nhanh bằng Camera AI (Đã Việt hóa 100%)
                DonateActionCard(onAction: {
                    showCamera = true
                })
                
                // 4. Widget Chiến dịch quyên góp khẩn cấp tại Đà Nẵng
                if let camp = urgentCampaign {
                    UrgentCampaignHomeCard(
                        campaign: camp,
                        onAction: {
                            selectedCampaignForDetail = camp
                        }
                    )
                }
                
                // 5. Danh sách Quyên góp gần đây & Kích hoạt Theo dõi đơn #DON-2026
                RecentDonationsSection(
                    items: recentItems,
                    onSeeAll: {
                        showHistorySheet = true
                    },
                    onSelectItem: { _ in
                        showHistorySheet = true
                    }
                )
            }
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarHidden(true)
        // Mở chu trình quyên góp trọn vẹn dạng fullScreenCover
        .fullScreenCover(isPresented: $showCamera) {
            NavigationStack {
                DonationCameraView(
                    onFinishCapturing: { images in
                        if let firstImg = images.first {
                            capturedImage = firstImg
                        }
                    },
                    onBackToHome: {
                        showCamera = false
                    }
                )
            }
        }
        // Mở Hồ sơ cá nhân dạng Sheet
        .sheet(isPresented: $showProfileSheet) {
            ProfileView()
        }
        // Mở Chi tiết 3 Trạm ReShare Hub & Chỉ đường Apple Maps
        .sheet(isPresented: $showHubsSheet) {
            HubsListSheet()
        }
        // Mở Chi tiết chiến dịch khẩn cấp dạng Sheet
        .sheet(item: $selectedCampaignForDetail) { camp in
            NavigationStack {
                CampaignDetailView(campaign: camp)
            }
        }
        // Mở Lịch sử & Theo dõi vận đơn #DON-2026
        .sheet(isPresented: $showHistorySheet) {
            DonationHistoryView()
        }
        .task {
            await loadRecentDonations()
        }
        .refreshable {
            await loadRecentDonations()
        }
        .onChange(of: showCamera) { _, isOpen in
            if !isOpen {
                Task {
                    await loadRecentDonations()
                }
            }
        }
    }
    
    // Tải các đơn quyên góp thực tế mới nhất của người dùng từ Cloud Firestore
    private func loadRecentDonations() async {
        guard let uid = AuthService.shared.currentUserId, !uid.isEmpty else { return }
        do {
            let liveDonations = try await FirestoreService.shared.fetchRecentDonations(donorId: uid, limit: 5)
            await MainActor.run {
                self.recentItems = liveDonations
            }
        } catch {
            print("⚠️ [HomeView] Không thể tải danh sách quyên góp gần đây: \(error.localizedDescription)")
        }
    }
}

#Preview {
    HomeView()
        .environmentObject(AppState())
}
