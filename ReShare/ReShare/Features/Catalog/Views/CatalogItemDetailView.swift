import SwiftUI
import MapKit
import FirebaseFirestore

/// Màn hình Chi tiết Món đồ 0đ Cộng đồng (P2P Trao tặng trực tiếp giữa người dân Đà Nẵng)
struct CatalogItemDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let item: CatalogItem
    @State private var selectedPhotoIndex = 0
    @State private var showContactSheet = false
    @State private var openChatAfterSheet = false
    @State private var showChat = false
    @State private var liveItem: CatalogItem?
    @State private var itemListener: ListenerRegistration?
    @State private var showCloseConfirmation = false
    @State private var isClosing = false
    @State private var actionError: String?

    private var displayedItem: CatalogItem { liveItem ?? item }


    // Màu sắc nhận diện ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)

    private var currentUserId: String {
        AuthService.shared.currentUserId ?? ""
    }

    private var isMyItem: Bool {
        guard !currentUserId.isEmpty else { return false }
        return displayedItem.donorId == currentUserId
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 18) {
                // 1. Khung ảnh lớn paged carousel
                photoCarouselSection

                // 2. Tiêu đề món đồ & Các huy hiệu trạng thái
                titleAndBadgesSection

                // 3. Thẻ Lời nhắn & Mô tả của Người trao tặng (Thay cho kiểm định kho)
                donorNoteCard

                // 4. Thẻ thông tin Người trao tặng (Donor Profile)
                donorProfileCard

                // 5. Địa điểm hẹn nhận đồ P2P trực tiếp tại Đà Nẵng
                p2pPickupLocationCard

                // 6. Cam kết trao tặng 0đ tuần hoàn
                circularPledgeBanner
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 100) // Đệm để không bị thanh dính đáy che khuất
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
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 14) {
                    ShareLink(item: "Món đồ 0đ trên ReShare: \(displayedItem.title) — \(displayedItem.district), Đà Nẵng") {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.primary)
            }
        }
        // Thanh nút bấm cố định dính đáy.
        .safeAreaInset(edge: .bottom) {
            stickyBottomActionBar
        }
        .sheet(isPresented: $showContactSheet, onDismiss: {
            if openChatAfterSheet && displayedItem.status != .closed && displayedItem.status != .completed {
                openChatAfterSheet = false
                showChat = true
            } else {
                openChatAfterSheet = false
            }
        }) {
            contactSheet
        }
        .navigationDestination(isPresented: $showChat) {
            ChatConversationView(item: displayedItem)
        }
        .onAppear {
            guard itemListener == nil else { return }
            itemListener = FirestoreService.shared.observeItem(itemId: item.id) { updated in
                Task { @MainActor in liveItem = updated }
            }
        }
        .onDisappear {
            itemListener?.remove()
            itemListener = nil
        }
        .confirmationDialog("Đóng bài đăng này?", isPresented: $showCloseConfirmation) {
            Button("Đóng bài", role: .destructive) { closeItem() }
        } message: {
            Text("Bài sẽ không còn hiện trong Kho đồ 0đ. Ảnh và lịch sử vẫn được giữ lại.")
        }
    }

    private var contactSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Liên hệ người cho")
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                Button("Đóng", systemImage: "xmark") { showContactSheet = false }
                    .labelStyle(.iconOnly)
                    .tint(.secondary)
            }

            Text("Trao đổi về \(displayedItem.title) với \(displayedItem.donorName).")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .lineLimit(2)

            if displayedItem.status == .closed || displayedItem.status == .completed {
                Text("Món đồ không còn nhận liên hệ mới.")
                    .foregroundColor(.secondary)
            } else {
                Button {
                    openChatAfterSheet = true
                    showContactSheet = false
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "message.fill")
                            .frame(width: 36, height: 36)
                            .background(softMint, in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Nhắn tin trong ReShare")
                                .font(.system(size: 15, weight: .bold))
                            Text("Hẹn gặp và xác nhận bàn giao tại đây")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .foregroundColor(primaryGreen)
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.black.opacity(0.08)))
                }
            }

            Text("Chỉ người cho và người nhận trong cuộc trò chuyện xem được tin nhắn.")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.97, green: 0.98, blue: 0.96))
        .presentationDetents([.height(290)])
        .presentationDragIndicator(.visible)
    }

    // MARK: - 1. Photo Carousel
    private var photoCarouselSection: some View {
        ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: 22)
                .fill(Color(red: 0.92, green: 0.94, blue: 0.90))
                .frame(height: 240)

            if !displayedItem.photoURLs.isEmpty {
                TabView(selection: $selectedPhotoIndex) {
                    ForEach(displayedItem.photoURLs.indices, id: \.self) { index in
                        CatalogItemPhotoView(
                            urlString: displayedItem.photoURLs[index],
                            legacyBase64: nil,
                            placeholderName: displayedItem.imageName
                        )
                        .frame(maxWidth: .infinity, maxHeight: 240)
                        .clipped()
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 22))
            } else {
                CatalogItemPhotoView(
                    urlString: nil,
                    legacyBase64: displayedItem.imageBase64,
                    placeholderName: displayedItem.imageName
                )
                .frame(maxWidth: .infinity, maxHeight: 240)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 22))
            }

            // Huy hiệu cộng đồng Đà Nẵng góc trên - trái
            VStack {
                HStack {
                    HStack(spacing: 5) {
                        Image(systemName: "hand.raised.fill")
                            .foregroundColor(mintGreen)
                        Text("Trao tặng cộng đồng (P2P)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.primary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.92))
                    .clipShape(Capsule())
                    .shadow(color: Color.black.opacity(0.06), radius: 4)

                    Spacer()
                }
                Spacer()
            }
            .padding(12)

            Text("📷 \(selectedPhotoIndex + 1)/\(max(displayedItem.photoURLs.count, 1))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.black.opacity(0.55))
                .clipShape(Capsule())
                .padding(12)
        }
    }

    // MARK: - 2. Title & Status Badges
    private var titleAndBadgesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Hàng Badge trạng thái
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Circle().fill(displayedItem.status.color).frame(width: 6, height: 6)
                    Text(displayedItem.status.displayText)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(displayedItem.status.color)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(displayedItem.status.badgeBgColor)
                .clipShape(Capsule())

                Text("Free / 0đ")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(red: 0.08, green: 0.35, blue: 0.18))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color(red: 0.55, green: 0.92, blue: 0.70))
                    .clipShape(Capsule())

                Text("Độ mới: \(displayedItem.condition)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.black.opacity(0.05))
                    .clipShape(Capsule())

                if isMyItem {
                    HStack(spacing: 3) {
                        Image(systemName: "person.fill")
                        Text("Đồ của bạn")
                    }
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(primaryGreen)
                    .clipShape(Capsule())
                }
            }

            // Tiêu đề
            Text(displayedItem.title)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.primary)

            // Phân loại & Thời gian
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 11))
                    Text(displayedItem.category)
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.secondary)

                Text("•").foregroundColor(.secondary)

                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                    Text("Đăng \(displayedItem.timeAgo)")
                        .font(.system(size: 12))
                }
                .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 3. Thẻ Lời nhắn & Mô tả từ Người cho (Thay thế biên bản kho)
    private var donorNoteCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "quote.bubble.fill")
                    .foregroundColor(mintGreen)
                Text("LỜI NHẮN TỪ NGƯỜI TRAO TẶNG")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }

            Text(displayedItem.donorNote)
                .font(.system(size: 13))
                .foregroundColor(.primary.opacity(0.9))
                .lineSpacing(4)

            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundColor(mintGreen)
                    Text("Đồ dùng sạch sẽ")
                        .font(.system(size: 11, weight: .medium))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color(red: 0.95, green: 0.97, blue: 0.94))
                .cornerRadius(8)

                HStack(spacing: 4) {
                    Image(systemName: "house.fill")
                        .font(.system(size: 11))
                        .foregroundColor(primaryGreen)
                    Text("Nhận tại nhà người cho")
                        .font(.system(size: 11, weight: .medium))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color(red: 0.95, green: 0.97, blue: 0.94))
                .cornerRadius(8)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 4. Thẻ Người trao tặng (Donor Profile)
    private var donorProfileCard: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(red: 0.15, green: 0.35, blue: 0.22)).frame(width: 44, height: 44)
                Text((isMyItem ? "BẠN" : String(displayedItem.donorName.prefix(2))).uppercased())
                    .font(.system(size: isMyItem ? 11 : 14, weight: .bold))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(isMyItem ? "Bạn (Người đăng tặng)" : displayedItem.donorName)
                        .font(.system(size: 14, weight: .bold))
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 11))
                        .foregroundColor(mintGreen)
                }
                Text(isMyItem && displayedItem.status == .closed ? "Bài đăng đã đóng" :
                    (isMyItem ? "Món đồ đang chia sẻ tại \(displayedItem.district), Đà Nẵng" : "Cư dân tại \(displayedItem.district), Đà Nẵng"))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(isMyItem ? "Chủ món đồ" : "Người cho uy tín")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(primaryGreen)
                Text(isMyItem ? "100% 0đ" : "Đã tặng 3 lần")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(softMint)
            .cornerRadius(8)
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 5. Địa điểm hẹn nhận đồ P2P trực tiếp tại Đà Nẵng
    private var p2pPickupLocationCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ĐỊA ĐIỂM HẸN NHẬN ĐỒ TRỰC TIẾP")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Trong TP. Đà Nẵng")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(primaryGreen)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: "mappin.circle.fill")
                        .foregroundColor(primaryGreen)
                        .font(.system(size: 16))
                    Text(displayedItem.pickupAddress)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)
                }

                Text("• Người nhận chủ động đến nhà người cho để nhận đồ trực tiếp.")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .padding(.top, 2)

                Text("• Hãy nhắn tin với người cho để thống nhất khung giờ hẹn lấy thuận tiện nhất cho cả hai.")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }

    // MARK: - 6. Cam kết sống xanh tuần hoàn
    private var circularPledgeBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(primaryGreen).frame(width: 36, height: 36)
                Image(systemName: "arrow.3.trianglepath")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("Cam kết 100% Free - Nhận đồ có trách nhiệm")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(primaryGreen)
                Text("Món đồ này được trao tặng hoàn toàn miễn phí. Vui lòng đến nhận đúng giờ đã hẹn với người cho để giữ gìn văn hóa sẻ chia đẹp của cộng đồng Đà Nẵng nhé!")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineSpacing(2)
            }
        }
        .padding(14)
        .background(softMint)
        .cornerRadius(18)
    }

    // MARK: - 7. Sticky Bottom Action Bar
    private var stickyBottomActionBar: some View {
        VStack(spacing: 6) {
            if isMyItem {
                // Giao diện dành riêng cho Người A (Chủ món đồ)
                if displayedItem.status == .available {
                    HStack(spacing: 12) {
                        NavigationLink(destination: CatalogItemEditView(item: displayedItem)) {
                            Text("Sửa thông tin")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button("Đóng bài") { showCloseConfirmation = true }
                            .frame(maxWidth: .infinity)
                            .buttonStyle(.bordered)
                            .disabled(isClosing)
                    }
                    .tint(primaryGreen)
                }

                if let actionError {
                    Text(actionError)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                }

                NavigationLink(destination: ConversationsListView(
                    filteredItemId: displayedItem.id,
                    filterItemTitle: displayedItem.title
                )) {
                    HStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                        Text("Xem tin nhắn người hỏi xin món này")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(primaryGreen)
                    .foregroundColor(.white)
                    .cornerRadius(14)
                    .shadow(color: primaryGreen.opacity(0.3), radius: 6, y: 3)
                }

                Text("🌟 Đây là món đồ của bạn. Bạn không thể tự xin đồ của chính mình.")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.secondary)
            } else {
                // Giao diện dành cho Người B (Người xin đồ từ cộng đồng)
                HStack(spacing: 12) {
                    // Mở sheet liên hệ trước khi vào chat P2P.
                    if displayedItem.status == .completed || displayedItem.status == .closed {
                        Text(displayedItem.status.displayText)
                            .font(.system(size: 15, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color(uiColor: .systemGray2))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                    } else {
                        Button { showContactSheet = true } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "message.fill")
                                Text(displayedItem.status == .reserved ? "Liên hệ (Đã có người hẹn)" : "Liên hệ người cho (0đ)")
                                    .font(.system(size: 15, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(displayedItem.status == .reserved ? Color.orange : primaryGreen)
                            .foregroundColor(.white)
                            .cornerRadius(14)
                            .shadow(color: primaryGreen.opacity(0.3), radius: 6, y: 3)
                        }
                    }
                }

                Text("📍 Trao nhận trực tiếp tận tay. Hoàn toàn 0đ.")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.secondary)
            }
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

    private func closeItem() {
        guard let ownerId = AuthService.shared.currentUserId, !ownerId.isEmpty else { return }
        isClosing = true
        actionError = nil
        Task {
            do {
                try await FirestoreService.shared.closeCatalogItem(itemId: displayedItem.id, ownerId: ownerId)
                isClosing = false
            } catch {
                actionError = "Không thể đóng bài: \(error.localizedDescription)"
                isClosing = false
            }
        }
    }
}

#Preview {
    NavigationStack {
        CatalogItemDetailView(
            item: CatalogItem(
                id: "test",
                title: "Calculus & Algebra University Textbooks",
                category: "Sách vở",
                condition: "Còn rất mới (95%)",
                district: "Hải Châu",
                timeAgo: "20 phút trước",
                imageName: "book.closed.fill",
                donorName: "Nguyễn Minh Trí"
            )
        )
    }
}
