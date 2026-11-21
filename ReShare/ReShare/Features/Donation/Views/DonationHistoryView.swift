import SwiftUI

/// Màn hình Lịch sử Quyên góp (Ảnh 1 - Chuẩn Proposal với Filter 4 trạng thái)
struct DonationHistoryView: View {
    @Environment(\.dismiss) private var dismiss

    // Tab bộ lọc: All, Pending, In Stock, Distributed
    @State private var selectedFilter: String = "Tất cả"
    @State private var items: [DonationItem] = []
    // Điểm tiếp nhận đọc từ Firestore (tên + cờ minh hoạ), thay cho tên gõ cứng.
    @State private var hubs: [String: HubRecord] = [:]
    @State private var isLoading: Bool = false
    @State private var loadError: String? = nil
    private let filters = ["Tất cả", "Chờ tiếp nhận", "Đã duyệt", "Đã tiếp nhận", "Trong kho", "Đã trao", "Từ chối", "Đã huỷ"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                // Thanh bộ lọc ngang (Horizontal Filter Pills)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(filters, id: \.self) { filter in
                            Button(action: { selectedFilter = filter }) {
                                Text(filter)
                                    .scaledFont(size: 13, weight: .bold)
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
                            .scaledFont(size: 48)
                            .foregroundColor(.secondary.opacity(0.35))
                        Text("Chưa có đơn quyên góp nào")
                            .scaledFont(size: 16, weight: .bold)
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                        Text("Đơn quyên góp bạn gửi sẽ xuất hiện tại đây, kèm trạng thái kho duyệt và tiếp nhận.")
                            .scaledFont(size: 13)
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
                                HistoryItemCard(item: item, hub: item.hubId.flatMap { hubs[$0] },
                                                onResubmitted: { Task { await loadHistory() } },
                                                onCancelled: { await loadHistory() })
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                    }
                    .refreshable {
                        await loadHistory()
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
                        .scaledFont(size: 15, weight: .bold)
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
        // Tên điểm tiếp nhận là dữ liệu phụ: tải song song nhưng KHÔNG chờ nó mới hiện đơn.
        // Đơn về trước thì hiện ngay với nhãn chung "Điểm tiếp nhận"; tên điểm về sau thì cập nhật nhãn.
        // Lỗi tải điểm không biến thành lỗi tải lịch sử. Task bị huỷ khi đóng màn thì không ghi tiếp.
        async let hubList = try? FirestoreService.shared.fetchActiveHubs()
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
        if let loadedHubs = await hubList, !Task.isCancelled {
            await MainActor.run {
                self.hubs = Dictionary(loadedHubs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
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
            "Từ chối": .rejected,
            "Đã huỷ": .cancelled
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
    /// Điểm tiếp nhận đang hoạt động của đơn (nil khi đơn không chọn điểm, điểm đã ngừng hoặc chưa tải được).
    var hub: HubRecord? = nil
    var onResubmitted: () -> Void = {}
    var onCancelled: () async -> Void = {}
    @State private var protectedImageURL: URL?
    @State private var showResubmit = false
    @State private var didResubmit = false
    @State private var showCancelConfirmation = false
    @State private var isCancelling = false
    @State private var cancellationError: String?
    @State private var showDetail = false

    private var canCancel: Bool {
        item.status == .pending && item.reviewState != "needs_information"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { showDetail = true } label: {
                summary.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Mở chi tiết đơn quyên góp")

            if item.status == .pending && item.reviewState == "needs_information" {
                Button("Bổ sung và gửi duyệt lại") { showResubmit = true }
                    .scaledFont(size: 12, weight: .semibold)
                    .padding(.leading, 82)
            }
            if canCancel {
                Button(isCancelling ? "Đang huỷ đơn…" : "Huỷ đơn", role: .destructive) {
                    showCancelConfirmation = true
                }
                .scaledFont(size: 12, weight: .semibold)
                .disabled(isCancelling)
                .padding(.leading, 82)
            }
            if let cancellationError {
                Text(cancellationError)
                    .scaledFont(size: 12)
                    .foregroundStyle(.red)
                    .padding(.leading, 82)
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
        .sheet(isPresented: $showDetail) {
            DonationHistoryDetailView(
                item: item, hubName: hubDisplayName,
                campaignTitle: item.campaignId.flatMap { FirestoreService.shared.knownCampaignTitles[$0] }
            )
        }
        .sheet(isPresented: $showResubmit, onDismiss: {
            if didResubmit {
                didResubmit = false
                onResubmitted()
            }
        }) { DonationResubmitView(item: item, onResubmitted: { didResubmit = true }) }
        .confirmationDialog("Huỷ đơn quyên góp này?", isPresented: $showCancelConfirmation, titleVisibility: .visible) {
            Button("Huỷ đơn", role: .destructive) { Task { await cancelDonation() } }
            Button("Giữ đơn", role: .cancel) { }
        } message: {
            Text("Kho sẽ không xử lý đơn nữa.")
        }
    }

    private var summary: some View {
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
            .task(id: "\(item.id)-\(item.imagePublicIds?.first ?? "")") {
                protectedImageURL = nil
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
                    Text("\(item.category.title.uppercased()) • \(item.declaredQuantityLabel)")
                        .scaledFont(size: 10, weight: .bold)
                        .foregroundColor(Color(red: 0.35, green: 0.45, blue: 0.35))

                    Spacer()

                    // Badge trạng thái chuẩn màu
                    HStack(spacing: 4) {
                        Circle()
                            .fill(item.status.color)
                            .frame(width: 5, height: 5)

                        Text(item.status.donorTitle(reviewState: item.reviewState))
                            .scaledFont(size: 11, weight: .bold)
                            .foregroundColor(item.status.color)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(item.status.color.opacity(0.12)))
                }

                // Hàng 2: Tên món đồ (Font Serif sang trọng)
                Text(item.title)
                    .scaledFont(size: 15, weight: .bold, design: .serif)
                    .foregroundColor(Color(red: 0.11, green: 0.27, blue: 0.16))
                    .lineLimit(1)

                // Hàng 3: Ghi chú từ chối (NẾU BỊ REJECTED) hoặc Yêu cầu bổ sung thông tin
                if item.status == .rejected, let reason = item.statusNote {
                    HStack(alignment: .top, spacing: 4) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .scaledFont(size: 10)
                        Text(reason)
                            .scaledFont(size: 11)
                            .lineLimit(2)
                    }
                    .foregroundColor(Color.red.opacity(0.85))
                    .padding(6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.red.opacity(0.06)))
                    .padding(.top, 2)
                } else if item.reviewState == "needs_information", let message = item.statusNote {
                    HStack(alignment: .top, spacing: 4) {
                        Image(systemName: "questionmark.circle.fill")
                            .scaledFont(size: 10)
                        Text("Yêu cầu bổ sung: \(message)")
                            .scaledFont(size: 11)
                            .lineLimit(2)
                    }
                    .foregroundColor(Color.orange.opacity(0.95))
                    .padding(6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.orange.opacity(0.08)))
                    .padding(.top, 2)
                }

                // Hàng 4: Thời gian gửi & Trạm tiếp nhận
                HStack {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .scaledFont(size: 10)
                        Text(VietnameseDateText.dateTime(item.createdAt))
                            .scaledFont(size: 11)
                    }
                    .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))

                    Spacer()

                    Text(hubDisplayName)
                        .scaledFont(size: 11, weight: .medium)
                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                }
                .padding(.top, 2)
            }
        }
    }

    @MainActor
    private func cancelDonation() async {
        guard canCancel, !isCancelling else { return }
        isCancelling = true
        cancellationError = nil
        defer { isCancelling = false }
        do {
            try await DonationCancellationService.cancel(donationId: item.id, expectedVersion: item.version ?? 1)
            await onCancelled()
        } catch {
            cancellationError = error is URLError ? "Không kết nối được để huỷ đơn. Vui lòng thử lại." : error.localizedDescription
        }
    }

    // Tên lưu kèm đơn lúc gửi đứng trước; đơn cũ lấy tên điểm đang hoạt động; còn lại nhãn chung.
    private var hubDisplayName: String {
        HubDisplayName.label(hubId: item.hubId, savedName: item.hubName, currentName: hub?.name, currentIsDemo: hub?.isDemo)
    }

    // Icon placeholder khi chưa có ảnh mạng
    private var placeholderIcon: some View {
        Image(systemName: item.category.iconName)
            .scaledFont(size: 26)
            .foregroundColor(Color(red: 0.25, green: 0.40, blue: 0.30).opacity(0.75))
            .frame(width: 68, height: 68)
    }
}

#Preview {
    DonationHistoryView()
}
