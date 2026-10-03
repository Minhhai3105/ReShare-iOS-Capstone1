import SwiftUI

/// Màn hình Lịch sử Quyên góp (Ảnh 1 - Chuẩn Proposal với Filter 4 trạng thái)
struct DonationHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    
    // Tab bộ lọc: All, Pending, In Stock, Distributed
    @State private var selectedFilter: String = "Tất cả"
    @State private var items: [DonationItem] = []
    @State private var isLoading: Bool = false
    @State private var loadError: String? = nil
    private let filters = ["Tất cả", "Chờ tiếp nhận", "Đã duyệt", "Đã tiếp nhận", "Trong kho", "Đã trao", "Từ chối"]
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                // Thanh bộ lọc ngang (Horizontal Filter Pills)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(filters, id: \.self) { filter in
                            Button(action: { selectedFilter = filter }) {
                                Text(filter)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(selectedFilter == filter ? .white : Color(red: 0.20, green: 0.25, blue: 0.22))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(
                                        Capsule()
                                            .fill(selectedFilter == filter ? Color(red: 0.15, green: 0.35, blue: 0.20) : Color(uiColor: .systemGray6))
                                    )
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 6)
                }
                
                // Danh sách các món đồ lịch sử
                if isLoading && items.isEmpty {
                    Spacer()
                    ProgressView("Đang tải lịch sử…")
                    Spacer()
                } else if let loadError {
                    VStack(spacing: 12) {
                        Spacer()
                        Text(loadError)
                            .multilineTextAlignment(.center)
                        Button("Thử lại") { Task { await loadHistory() } }
                        Spacer()
                    }
                    .padding(.horizontal, 24)
                } else if items.isEmpty && !isLoading {
                    VStack(spacing: 12) {
                        Spacer()
                        Image(systemName: "shippingbox")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary.opacity(0.35))
                        Text("Chưa có đơn quyên góp nào")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                        Text("Đơn thử nghiệm của bạn sẽ xuất hiện tại đây. Hiện chưa có trạm ReShare tiếp nhận đồ thật.")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(3)
                            .padding(.horizontal, 36)
                        Spacer()
                    }
                } else if filteredItems.isEmpty {
                    Spacer()
                    Text("Không có đơn ở trạng thái này")
                        .foregroundColor(.secondary)
                    Spacer()
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(filteredItems) { item in
                                HistoryItemCard(item: item)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                    }
                }
            }
            .background(Color(red: 0.98, green: 0.98, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Lịch sử Quyên góp")
            .navigationBarTitleDisplayMode(.inline)
            .preferredColorScheme(.light)
            .environment(\.colorScheme, .light)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Xong") { dismiss() }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                }
            }
            .task {
                await loadHistory()
            }
        }
    }
    
    // Tải dữ liệu thật từ Cloud Firestore
    private func loadHistory() async {
        isLoading = true
        guard let currentUserId = AuthService.shared.currentUserId else {
            loadError = "Bạn cần đăng nhập để xem lịch sử quyên góp."
            isLoading = false
            return
        }
        do {
            let liveItems = try await FirestoreService.shared.fetchMyDonations(donorId: currentUserId)
            await MainActor.run {
                self.items = liveItems
                self.loadError = nil
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.loadError = "Không thể tải lịch sử quyên góp: \(error.localizedDescription)"
                self.isLoading = false
            }
        }
    }
    
    // Lọc danh sách theo trạng thái
    private var filteredItems: [DonationItem] {
        let statuses: [String: DonationStatus] = [
            "Chờ tiếp nhận": .pending,
            "Đã duyệt": .approved,
            "Đã tiếp nhận": .received,
            "Trong kho": .inStock,
            "Đã trao": .distributed,
            "Từ chối": .rejected
        ]
        guard let status = statuses[selectedFilter] else {
            return items
        }
        return items.filter { $0.status == status }
    }
}

// Card hiển thị 1 món đồ trong lịch sử
// MARK: - Card hiển thị 1 món đồ trong Lịch sử (Kèm Ảnh thật + Chấm trạng thái)
struct HistoryItemCard: View {
    let item: DonationItem
    @State private var protectedImageURL: URL?
    
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            // MARK: CỘT 1: THUMBNAIL ẢNH MÓN ĐỒ (CÓ CHẤM TRẠNG THÁI GÓC DƯỚI)
            ZStack(alignment: .bottomTrailing) {
                // Khung chứa ảnh
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(red: 0.96, green: 0.97, blue: 0.94)) // Nền kem nhạt chuẩn Figma
                        .frame(width: 68, height: 68)
                    
                    // 1. Nếu có URL ảnh thật thì tải bằng AsyncImage
                    if let url = protectedImageURL ?? item.primaryImageUrl.flatMap(URL.init(string:)) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 68, height: 68)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            case .failure(_), .empty:
                                placeholderIcon
                            @unknown default:
                                placeholderIcon
                            }
                        }
                    } else {
                        // 2. Fallback: Icon danh mục thanh lịch
                        placeholderIcon
                    }
                }
                
                // Chấm màu trạng thái ở góc dưới bên phải ảnh (như trong ảnh mẫu)
                Circle()
                    .fill(item.status.color)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().stroke(Color.white, lineWidth: 2))
                    .offset(x: -3, y: -3)
            }
            .task(id: item.id) {
                guard item.imageProvider == "cloudinary",
                      let publicId = item.imagePublicIds?.first else { return }
                protectedImageURL = try? await CloudinaryImageService.shared.privateDonationImageURL(
                    donationId: item.id,
                    publicId: publicId
                )
            }
            
            // MARK: CỘT 2: THÔNG TIN CHI TIẾT
            VStack(alignment: .leading, spacing: 5) {
                // Hàng 1: Danh mục + Badge trạng thái
                HStack {
                    Text("\(item.category.title.uppercased()) • 1 ITEM")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(red: 0.35, green: 0.45, blue: 0.35))
                    
                    Spacer()
                    
                    // Badge trạng thái chuẩn màu
                    HStack(spacing: 4) {
                        Circle()
                            .fill(item.status.color)
                            .frame(width: 5, height: 5)
                        
                        Text(item.status.title)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(item.status.color)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(item.status.color.opacity(0.12)))
                }
                
                // Hàng 2: Tên món đồ (Font Serif sang trọng)
                Text(item.title)
                    .font(.system(size: 15, weight: .bold, design: .serif))
                    .foregroundColor(Color(red: 0.11, green: 0.27, blue: 0.16))
                    .lineLimit(1)
                
                // Hàng 3: Ghi chú từ chối (NẾU BỊ REJECTED)
                if item.status == .rejected, let reason = item.statusNote {
                    HStack(alignment: .top, spacing: 4) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .font(.system(size: 10))
                        Text(reason)
                            .font(.system(size: 11))
                            .lineLimit(2)
                    }
                    .foregroundColor(Color.red.opacity(0.85))
                    .padding(6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.red.opacity(0.06)))
                    .padding(.top, 2)
                }
                
                // Hàng 4: Thời gian gửi & Trạm tiếp nhận
                HStack {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 10))
                        Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                    }
                    .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                    
                    Spacer()
                    
                    Text(hubDisplayName)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                }
                .padding(.top, 2)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.black.opacity(0.08), lineWidth: 1)
        )
    }

    private var hubDisplayName: String {
        switch item.hubId {
        case "hub-haichau": return "Demo Hải Châu"
        case "hub-nguhanhson": return "Demo Ngũ Hành Sơn"
        case "hub-lienchieu": return "Demo Liên Chiểu"
        default: return "Chưa có điểm tiếp nhận"
        }
    }
    
    // Icon placeholder khi chưa có ảnh mạng
    private var placeholderIcon: some View {
        Image(systemName: item.category.iconName)
            .font(.system(size: 26))
            .foregroundColor(Color(red: 0.25, green: 0.40, blue: 0.30).opacity(0.75))
            .frame(width: 68, height: 68)
    }
}

#Preview {
    DonationHistoryView()
}
