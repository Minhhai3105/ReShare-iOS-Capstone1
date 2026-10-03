import SwiftUI
import FirebaseFirestore
import Combine

/// Màn hình In-App Chat 1-1 giữa Người xin và Người cho đồ tại Đà Nẵng
/// Tích hợp quy trình: Đề xuất hẹn -> Người cho duyệt giữ đồ (Transaction) -> Bàn giao 2 bên xác nhận (100% 0đ)
struct ChatConversationView: View {
    @Environment(\.dismiss) private var dismiss
    let item: CatalogItem
    var conversation: ChatConversation? = nil
    var customChatId: String? = nil

    // Quản lý trạng thái realtime
    @State private var currentItem: CatalogItem? = nil
    @State private var currentConversation: ChatConversation? = nil
    @State private var messageText: String = ""
    @State private var messages: [ChatMessageItem] = []

    // Realtime listeners
    @State private var messagesListener: ListenerRegistration? = nil
    @State private var conversationListener: ListenerRegistration? = nil
    @State private var itemListener: ListenerRegistration? = nil
    @State private var didRefreshListenersAfterWrite: Bool = false

    // Sheet đề xuất lịch hẹn của Người nhận
    @State private var showAppointmentPickerSheet: Bool = false
    @State private var selectedAppointmentDate: Date = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date()
    @State private var appointmentNote: String = ""

    // Trạng thái thao tác & Hộp thoại
    @State private var showCancelReservationDialog: Bool = false
    @State private var isProcessingAction: Bool = false
    @State private var actionErrorMessage: String? = nil
    @State private var showActionAlert: Bool = false
    @State private var alertTitle: String = "Thông báo"
    @State private var now: Date = Date()

    @FocusState private var isInputFocused: Bool

    // Màu sắc nhận diện ReShare Đà Nẵng
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let lightGreenBg = Color(red: 0.88, green: 0.96, blue: 0.90)
    private let chatBubbleUser = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let chatBubbleOther = Color(red: 0.94, green: 0.95, blue: 0.94)

    private let quickReplies = [
        "Dạ em cảm ơn bạn nhiều nhé!",
        "Chiều nay mình ghé nhà bạn lấy được không ạ?",
        "Địa chỉ cụ thể ở số mấy thế bạn?",
        "Tầm 17h mình qua nhận đồ nhé!"
    ]

    var body: some View {
        VStack(spacing: 0) {
            // 1. Thẻ thông tin món đồ ghim đầu đoạn chat (Pinned Item Header)
            pinnedItemHeader

            // 2. Banner Chốt hẹn & Bàn giao 2 bên (Giải quyết bài toán 1 món nhiều người xin)
            reservationControlBanner

            // 3. Danh sách tin nhắn cuộn mượt mà
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 12) {
                        // Cảnh báo an toàn & cam kết 0đ
                        safetyNoticeBanner
                            .padding(.top, 10)

                        if messages.isEmpty {
                            emptyMessagesPlaceholder
                        } else {
                            ForEach(messages) { msg in
                                messageRow(for: msg)
                                    .id(msg.id)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
                .onChange(of: messages.count) { _, _ in
                    if let lastId = messages.last?.id {
                        withAnimation(.easeOut(duration: 0.25)) {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                    if let lastMsg = messages.last {
                        Task {
                            do {
                                try await FirestoreService.shared.markConversationAsRead(
                                    chatId: activeChatId,
                                    userId: currentUserId,
                                    messageTime: lastMsg.createdAt
                                )
                            } catch {
                                print("⚠️ [Chat] Không thể đánh dấu đã đọc: \(error.localizedDescription)")
                            }
                        }
                    }
                }
            }

            // 4. Gợi ý trả lời nhanh (Quick Response Chips)
            quickRepliesSection

            // 5. Thanh nhập tin nhắn (Input Bar)
            inputBarSection
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(primaryGreen)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white))
                        .shadow(color: Color.black.opacity(0.06), radius: 4)
                }
            }

            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    HStack(spacing: 5) {
                        Text(partnerDisplayName)
                            .font(.system(size: 15, weight: .bold))
                        Image(systemName: "message.fill")
                            .font(.system(size: 11))
                            .foregroundColor(mintGreen)
                    }
                    Text("Trao đổi qua tin nhắn")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }

        }
        .sheet(isPresented: $showAppointmentPickerSheet) {
            appointmentProposalSheet
        }
        .confirmationDialog(
            "Bạn có chắc muốn hủy lịch hẹn?",
            isPresented: $showCancelReservationDialog,
            titleVisibility: .visible
        ) {
            Button("Hủy lịch hẹn", role: .destructive) {
                handleCancelReservation()
            }
            Button("Giữ lịch hẹn", role: .cancel) {}
        } message: {
            Text("Sau khi hủy, món đồ sẽ được mở lại cho những người khác có thể xin và hẹn nhận.")
        }
        .alert(alertTitle, isPresented: $showActionAlert) {
            Button("Đã hiểu", role: .cancel) {}
        } message: {
            Text(actionErrorMessage ?? "Có lỗi xảy ra trong quá trình xử lý.")
        }
        .onAppear {
            now = Date()
            startRealtimeListeners()
            Task {
                do {
                    try await FirestoreService.shared.markConversationAsRead(
                        chatId: activeChatId,
                        userId: currentUserId,
                        messageTime: Date()
                    )
                } catch {
                    print("⚠️ [Chat] Không thể đánh dấu đã đọc: \(error.localizedDescription)")
                }
            }
        }
        .onDisappear {
            stopRealtimeListeners()
        }
        .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { date in
            now = date
        }
    }

    // MARK: - Computed Properties Role & Trạng thái

    private var activeItem: CatalogItem {
        currentItem ?? item
    }

    private var activeConversation: ChatConversation? {
        currentConversation ?? conversation
    }

    private var currentUserId: String {
        AuthService.shared.currentUserId ?? "guest"
    }

    private var isDonor: Bool {
        currentUserId == activeItem.donorId
    }

    private var isRequester: Bool {
        !isDonor
    }

    private var activeChatId: String {
        if let custom = customChatId, !custom.isEmpty {
            return custom
        }
        if let conv = activeConversation {
            return conv.id
        }
        let donorId = activeItem.donorId.isEmpty ? "donor_pilot" : activeItem.donorId
        let sorted = [currentUserId, donorId].sorted().joined(separator: "_")
        return "chat_\(activeItem.id)_\(sorted)"
    }

    private var isCompleted: Bool {
        activeItem.status == .completed || activeConversation?.appointmentStatus == "completed"
    }

    private var isReservedByThisChat: Bool {
        guard !isCompleted else { return false }
        return (activeItem.status == .reserved && activeItem.reservedChatId == activeChatId) ||
               (activeConversation?.isReserved == true && activeItem.status == .reserved)
    }

    private var isReservedBySomeoneElse: Bool {
        guard !isCompleted else { return false }
        return activeItem.status == .reserved && activeItem.reservedChatId != nil && activeItem.reservedChatId != activeChatId
    }

    private var isAvailable: Bool {
        !isCompleted && !isReservedByThisChat && !isReservedBySomeoneElse
    }

    private var donorHandoverConfirmed: Bool {
        activeItem.donorHandoverConfirmed || (activeConversation?.donorHandoverConfirmed ?? false)
    }

    private var requesterHandoverConfirmed: Bool {
        activeItem.requesterHandoverConfirmed || (activeConversation?.requesterHandoverConfirmed ?? false)
    }

    private var myHandoverConfirmed: Bool {
        isDonor ? donorHandoverConfirmed : requesterHandoverConfirmed
    }

    private var partnerHandoverConfirmed: Bool {
        isDonor ? requesterHandoverConfirmed : donorHandoverConfirmed
    }

    private var pickupTime: Date? {
        activeItem.pickupTime ?? activeConversation?.proposedPickupTime
    }

    private var reservationDeadline: Date? {
        activeItem.reservationDeadline ?? activeConversation?.reservationDeadline
    }

    private var isDeadlineExpired: Bool {
        guard let deadline = reservationDeadline else { return false }
        return now >= deadline
    }

    private var partnerDisplayName: String {
        if let conv = activeConversation {
            return conv.partnerName(currentUserId: currentUserId)
        }
        if isDonor {
            return "Người nhận đồ"
        }
        return activeItem.donorName
    }

    // MARK: - 1. Pinned Item Header
    private var pinnedItemHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(red: 0.90, green: 0.93, blue: 0.88))
                    .frame(width: 48, height: 48)

                CatalogItemPhotoView(
                    urlString: activeItem.photoURLs.first,
                    legacyBase64: activeItem.imageBase64,
                    placeholderName: activeItem.imageName
                )
                .frame(width: 48, height: 48)
                .clipped()
                .cornerRadius(10)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(activeItem.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Text(isDonor ? "Món của bạn" : "Bạn đang xin")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(isDonor ? primaryGreen : .blue)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(isDonor ? lightGreenBg : Color.blue.opacity(0.1))
                        .clipShape(Capsule())
                }

                HStack(spacing: 6) {
                    Text("Free / 0đ")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(red: 0.08, green: 0.35, blue: 0.18))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(red: 0.55, green: 0.92, blue: 0.70))
                        .clipShape(Capsule())

                    Text("• Nhận tại: \(activeItem.pickupAddress)")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.black.opacity(0.06)),
            alignment: .bottom
        )
    }

    // MARK: - 2. Banner Chốt hẹn & Bàn giao 2 bên
    private var reservationControlBanner: some View {
        Group {
            if isCompleted {
                // Trạng thái: Đã hoàn tất 100% 0đ
                completedHandoverBanner
            } else if isReservedByThisChat {
                // Trạng thái: Đang giữ đồ cho cuộc trò chuyện này
                activeReservedHandoverBanner
            } else if isReservedBySomeoneElse {
                // Trạng thái: Đã có người khác chốt hẹn
                reservedByOtherBanner
            } else if isAvailable {
                // Trạng thái: Sẵn sàng nhận đồ
                availableStatusBanner
            }
        }
    }

    // 2.1 Banner: Đã hoàn tất bàn giao
    private var completedHandoverBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 26))
                .foregroundColor(primaryGreen)

            VStack(alignment: .leading, spacing: 3) {
                Text("🎉 ĐÃ TRAO TẶNG THÀNH CÔNG (100% 0Đ)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(primaryGreen)
                Text("Hai bên đã xác nhận hoàn tất nhận đồ tại Đà Nẵng. Cảm ơn hai bạn đã lan tỏa tinh thần sẻ chia!")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(lightGreenBg)
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(primaryGreen.opacity(0.3), lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // 2.2 Banner: Đang giữ đồ & Tiến độ bàn giao 2 bên
    private var activeReservedHandoverBanner: some View {
        VStack(spacing: 10) {
            // Hàng tiêu đề giờ hẹn & nút hủy
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "calendar.badge.checkmark")
                    .font(.system(size: 18))
                    .foregroundColor(primaryGreen)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Đã chốt hẹn nhận món đồ này!")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(primaryGreen)

                    if let pickup = pickupTime {
                        Text("📅 Giờ hẹn: \(formatPickupDate(pickup))")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.primary)
                    }

                    if let deadline = reservationDeadline {
                        Text("⏳ Hạn giữ đồ: \(formatDeadlineDate(deadline)) (+2h dự phòng)")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                if !isDeadlineExpired && !donorHandoverConfirmed && !requesterHandoverConfirmed {
                    Button(action: { showCancelReservationDialog = true }) {
                        Text("Hủy hẹn")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.red)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(6)
                    }
                }
            }

            Divider()

            // Tiến độ xác nhận 2 bên (Dual-party Confirmation)
            HStack(spacing: 8) {
                // Bên Người cho
                HStack(spacing: 4) {
                    Image(systemName: donorHandoverConfirmed ? "checkmark.circle.fill" : "circle.dashed")
                        .foregroundColor(donorHandoverConfirmed ? primaryGreen : .secondary)
                        .font(.system(size: 12))
                    Text(donorHandoverConfirmed ? "Người cho: Đã trao" : "Người cho: Chưa trao")
                        .font(.system(size: 10, weight: donorHandoverConfirmed ? .bold : .regular))
                        .foregroundColor(donorHandoverConfirmed ? primaryGreen : .secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(donorHandoverConfirmed ? primaryGreen.opacity(0.12) : Color.black.opacity(0.04))
                .clipShape(Capsule())

                // Bên Người nhận
                HStack(spacing: 4) {
                    Image(systemName: requesterHandoverConfirmed ? "checkmark.circle.fill" : "circle.dashed")
                        .foregroundColor(requesterHandoverConfirmed ? primaryGreen : .secondary)
                        .font(.system(size: 12))
                    Text(requesterHandoverConfirmed ? "Người nhận: Đã nhận" : "Người nhận: Chưa nhận")
                        .font(.system(size: 10, weight: requesterHandoverConfirmed ? .bold : .regular))
                        .foregroundColor(requesterHandoverConfirmed ? primaryGreen : .secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(requesterHandoverConfirmed ? primaryGreen.opacity(0.12) : Color.black.opacity(0.04))
                .clipShape(Capsule())

                Spacer()
            }

            // Nút hành động xác nhận bàn giao
            if !myHandoverConfirmed {
                Button(action: handleConfirmHandover) {
                    HStack(spacing: 6) {
                        if isProcessingAction {
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: isDonor ? "shippingbox.fill" : "gift.fill")
                                .font(.system(size: 13))
                        }

                        Text(isDonor ? "📦 Xác nhận: ĐÃ TRAO ĐỒ cho bạn này" : "🎁 Xác nhận: ĐÃ NHẬN ĐƯỢC ĐỒ")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(primaryGreen)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .disabled(isProcessingAction)
            } else {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(primaryGreen)
                        .font(.system(size: 13))
                    Text("Bạn đã bấm xác nhận bàn giao. Đang chờ \(partnerDisplayName) xác nhận để hoàn tất (1/2)...")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(primaryGreen)
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            // Xử lý khi quá hạn 2 tiếng dự phòng
            if isDeadlineExpired {
                if !donorHandoverConfirmed && !requesterHandoverConfirmed {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("⚠️ Đã quá 2 tiếng dự phòng sau giờ hẹn mà chưa bên nào xác nhận.")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.red)

                        if isDonor {
                            Button(action: handleCancelReservation) {
                                Text("Mở lại món đồ cho người khác (Quá hạn hẹn)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.red)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 6)
                                    .background(Color.red.opacity(0.1))
                                    .cornerRadius(6)
                            }
                        }
                    }
                    .padding(.top, 2)
                } else {
                    Text("⏳ Đã có 1 bên xác nhận bàn giao. Món đồ được giữ để đối soát, không tự động hủy.")
                        .font(.system(size: 10))
                        .foregroundColor(.orange)
                }
            }
        }
        .padding(12)
        .background(Color(red: 0.93, green: 0.97, blue: 0.93))
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(primaryGreen.opacity(0.25), lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // 2.3 Banner: Món đồ đang được giữ bởi người khác
    private var reservedByOtherBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .foregroundColor(.orange)
                .font(.system(size: 13))
            Text("Món đồ này hiện đã có người khác chốt hẹn nhận trước. Bạn vẫn có thể trao đổi dự phòng nếu người hẹn trước không đến nhận.")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(Color.orange.opacity(0.1))
        .cornerRadius(8)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // 2.4 Banner: Sẵn sàng nhận đồ (Lời đề xuất của Người nhận)
    private var availableStatusBanner: some View {
        Group {
            if isRequester {
                Button(action: { showAppointmentPickerSheet = true }) {
                    HStack(spacing: 8) {
                        Image(systemName: "calendar.badge.clock")
                            .font(.system(size: 14, weight: .semibold))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Hẹn lịch đến nhận món đồ này (100% 0đ)")
                                .font(.system(size: 12, weight: .bold))
                            Text("Chủ động đề xuất giờ đến lấy trực tiếp tại nhà người cho")
                                .font(.system(size: 10))
                                .foregroundColor(primaryGreen.opacity(0.85))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(lightGreenBg)
                    .foregroundColor(primaryGreen)
                    .cornerRadius(10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(primaryGreen.opacity(0.3), lineWidth: 1))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(mintGreen)
                        .font(.system(size: 13))
                    Text("Món đồ đang sẵn sàng. Khi người nhận gửi đề xuất lịch hẹn, bạn có thể bấm 'Đồng ý' để giữ đồ.")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                .cornerRadius(8)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }
        }
    }

    // MARK: - 3. Cảnh báo an toàn
    private var safetyNoticeBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "shield.lefthalf.filled")
                .foregroundColor(mintGreen)
                .font(.system(size: 13))

            Text("Nền tảng 100% 0đ tại Đà Nẵng. Hai bên gặp mặt trao nhận đồ trực tiếp, tuyệt đối không chuyển khoản cọc.")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white)
        .cornerRadius(10)
        .shadow(color: Color.black.opacity(0.02), radius: 4)
    }

    // MARK: - Empty Placeholder
    private var emptyMessagesPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 32))
                .foregroundColor(mintGreen.opacity(0.6))
            Text("Chưa có tin nhắn nào")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(primaryGreen)
            Text("Hãy gửi tin nhắn để trao đổi chi tiết và hẹn thời gian nhận đồ nhé!")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .padding(.vertical, 24)
    }

    // MARK: - 4. Message Row
    @ViewBuilder
    private func messageRow(for msg: ChatMessageItem) -> some View {
        if msg.messageType == "appointment_proposal" {
            // Thẻ đề xuất hẹn nhận đồ tương tác
            appointmentProposalCard(for: msg)
        } else if msg.messageType == "system" || msg.senderId == "system" {
            // Tin nhắn thông báo hệ thống
            systemMessageView(text: msg.text)
        } else if msg.isCurrentUser {
            // Tin nhắn của tôi
            userMessageView(msg: msg)
        } else {
            // Tin nhắn đối phương
            partnerMessageView(msg: msg)
        }
    }

    // 4.1 Thẻ tin nhắn Đề xuất lịch hẹn
    private func appointmentProposalCard(for msg: ChatMessageItem) -> some View {
        let isProposalAccepted = (msg.appointmentStatus == "accepted")
        let isProposalDeclined = (msg.appointmentStatus == "declined")
        let isProposalPending = (msg.appointmentStatus == "pending" || msg.appointmentStatus == nil)

        return VStack(alignment: .leading, spacing: 10) {
            // Header Thẻ
            HStack(spacing: 6) {
                Image(systemName: "calendar.badge.clock")
                    .foregroundColor(primaryGreen)
                    .font(.system(size: 14))
                Text("ĐỀ XUẤT LỊCH HẸN NHẬN ĐỒ")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(primaryGreen)

                Spacer()

                if isProposalAccepted {
                    Text("✓ Đã đồng ý & Giữ đồ")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(primaryGreen)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(lightGreenBg)
                        .clipShape(Capsule())
                } else if isProposalDeclined {
                    Text("✕ Đã từ chối")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.red)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.red.opacity(0.1))
                        .clipShape(Capsule())
                } else {
                    Text("⏳ Chờ phản hồi")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.orange.opacity(0.15))
                        .clipShape(Capsule())
                }
            }

            // Khung giờ hẹn được đề xuất
            VStack(alignment: .leading, spacing: 4) {
                if let aptTime = msg.appointmentTime {
                    HStack(spacing: 6) {
                        Image(systemName: "clock.fill")
                            .foregroundColor(primaryGreen)
                            .font(.system(size: 13))
                        Text(formatPickupDate(aptTime))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(primaryGreen)
                    }
                }

                HStack(spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundColor(.secondary)
                        .font(.system(size: 11))
                    Text("Tại: \(activeItem.pickupAddress)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(red: 0.95, green: 0.97, blue: 0.95))
            .cornerRadius(8)

            if !msg.text.isEmpty {
                Text(msg.text)
                    .font(.system(size: 12))
                    .foregroundColor(.primary)
            }

            // Nút hành động cho Người cho đồ (A)
            if isProposalPending {
                if isDonor {
                    if isAvailable {
                        HStack(spacing: 10) {
                            Button(action: { handleAcceptAppointment(proposalMsg: msg) }) {
                                HStack(spacing: 4) {
                                    if isProcessingAction {
                                        ProgressView().tint(.white).scaleEffect(0.8)
                                    } else {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 12, weight: .bold))
                                    }
                                    Text("Đồng ý giữ đồ")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(primaryGreen)
                                .foregroundColor(.white)
                                .cornerRadius(8)
                            }
                            .disabled(isProcessingAction)

                            Button(action: { handleDeclineAppointment(proposalMsg: msg) }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 12, weight: .bold))
                                    Text("Từ chối")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Color(uiColor: .systemGray6))
                                .foregroundColor(.secondary)
                                .cornerRadius(8)
                            }
                            .disabled(isProcessingAction)
                        }
                    } else if isReservedByThisChat {
                        Text("✓ Lịch hẹn trong cuộc chat này đã được chấp nhận.")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(primaryGreen)
                    } else {
                        Text("⚠️ Món đồ hiện đang được giữ cho một người khác.")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                } else {
                    // Góc nhìn Người nhận (B)
                    HStack(spacing: 4) {
                        Image(systemName: "hourglass")
                            .font(.system(size: 11))
                        Text("Đang chờ \(partnerDisplayName) xác nhận đề xuất...")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.orange)
                }
            } else if isProposalAccepted {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundColor(primaryGreen)
                        .font(.system(size: 12))
                    Text("Hai bên đã chốt lịch hẹn này. Hãy đến đúng giờ bạn nhé!")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(primaryGreen)
                }
            } else if isProposalDeclined {
                Text("⚠️ Người cho chưa tiện khung giờ này. Hai bạn vui lòng nhắn tin để chọn khung giờ khác nhé.")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            // Thời gian gửi thẻ
            HStack {
                Spacer()
                Text(msg.timeString)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary.opacity(0.8))
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isProposalAccepted ? primaryGreen.opacity(0.4) : Color.black.opacity(0.08), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.03), radius: 6, y: 2)
        .padding(.horizontal, 4)
    }

    // 4.2 Tin nhắn hệ thống
    private func systemMessageView(text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.04))
            .cornerRadius(12)
            .frame(maxWidth: .infinity)
    }

    // 4.3 Tin nhắn của tôi
    private func userMessageView(msg: ChatMessageItem) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            Spacer(minLength: 40)

            VStack(alignment: .trailing, spacing: 3) {
                Text(msg.text)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(chatBubbleUser)
                    .cornerRadius(16)

                Text(msg.timeString)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary.opacity(0.8))
                    .padding(.horizontal, 4)
            }
        }
    }

    // 4.4 Tin nhắn của đối tác
    private func partnerMessageView(msg: ChatMessageItem) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            Circle()
                .fill(Color(red: 0.15, green: 0.35, blue: 0.22))
                .frame(width: 28, height: 28)
                .overlay(
                    Text(partnerDisplayName.prefix(1).uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(msg.text)
                    .font(.system(size: 14))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(chatBubbleOther)
                    .cornerRadius(16)

                Text(msg.timeString)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary.opacity(0.8))
                    .padding(.horizontal, 4)
            }

            Spacer(minLength: 40)
        }
    }

    // MARK: - 5. Quick Replies
    private var quickRepliesSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(quickReplies, id: \.self) { reply in
                    Button(action: {
                        sendMessage(text: reply)
                    }) {
                        Text(reply)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(primaryGreen)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.white)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(primaryGreen.opacity(0.25), lineWidth: 1))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - 6. Input Bar
    private var inputBarSection: some View {
        HStack(spacing: 10) {
            if isAvailable && isRequester {
                Button(action: { showAppointmentPickerSheet = true }) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 19))
                        .foregroundColor(primaryGreen)
                }
            }

            TextField("Nhắn tin với \(partnerDisplayName)...", text: $messageText)
                .font(.system(size: 14))
                .focused($isInputFocused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(red: 0.95, green: 0.96, blue: 0.95))
                .cornerRadius(20)

            Button(action: {
                let trimmed = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                sendMessage(text: trimmed)
                messageText = ""
            }) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 38, height: 38)
                    .background(
                        messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?
                            Color.secondary.opacity(0.4) : primaryGreen
                    )
                    .clipShape(Circle())
            }
            .disabled(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white.ignoresSafeArea(edges: .bottom))
    }

    // MARK: - 7. Sheet Đề xuất lịch hẹn của Người nhận (B)
    private var appointmentProposalSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                // Tóm tắt món đồ
                HStack(spacing: 10) {
                    Image(systemName: activeItem.imageName)
                        .font(.system(size: 20))
                        .foregroundColor(primaryGreen)
                        .frame(width: 40, height: 40)
                        .background(lightGreenBg)
                        .cornerRadius(8)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(activeItem.title)
                            .font(.system(size: 13, weight: .bold))
                            .lineLimit(1)
                        Text("Nhận tại: \(activeItem.pickupAddress)")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(red: 0.96, green: 0.97, blue: 0.96))
                .cornerRadius(10)

                Text("Chọn khung giờ bạn có thể đến lấy:")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)

                // Các mốc giờ gợi ý nhanh
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        presetButton(title: "Chiều nay 17:30", date: presetAfternoonToday)
                        presetButton(title: "Tối nay 19:30", date: presetEveningToday)
                        presetButton(title: "Sáng mai 09:00", date: presetMorningTomorrow)
                        presetButton(title: "Chiều mai 17:00", date: presetAfternoonTomorrow)
                    }
                }

                // Chọn ngày & giờ cụ thể
                DatePicker(
                    "Ngày & giờ nhận đồ",
                    selection: $selectedAppointmentDate,
                    in: Date()...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .datePickerStyle(.compact)
                .font(.system(size: 13))
                .padding(12)
                .background(Color.white)
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08), lineWidth: 1))

                // Lời nhắn thêm
                TextField("Lời nhắn thêm (ví dụ: Em đi xe máy qua chở luôn ạ)...", text: $appointmentNote)
                    .font(.system(size: 13))
                    .padding(12)
                    .background(Color.white)
                    .cornerRadius(10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08), lineWidth: 1))

                // Lưu ý cam kết 0đ & chưa khóa đồ
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(primaryGreen)
                        .font(.system(size: 14))
                    Text("Lời đề xuất này chưa khóa món đồ. Chỉ khi người cho bấm 'Đồng ý', món đồ mới chuyển sang 'Đã có người hẹn' để giữ cho bạn.")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .padding(10)
                .background(lightGreenBg.opacity(0.6))
                .cornerRadius(8)

                Spacer()

                // Nút gửi đề xuất
                Button(action: handleSendAppointmentProposal) {
                    HStack(spacing: 6) {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 13))
                        Text("Gửi đề xuất lịch hẹn")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(primaryGreen)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
            }
            .padding(18)
            .navigationTitle("Đề xuất lịch hẹn")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Đóng") {
                        showAppointmentPickerSheet = false
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(primaryGreen)
                }
            }
        }
        .presentationDetents([.medium, .fraction(0.75)])
    }

    private func presetButton(title: String, date: Date) -> some View {
        Button(action: {
            selectedAppointmentDate = date
        }) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(primaryGreen)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(primaryGreen.opacity(0.3), lineWidth: 1))
        }
    }

    // MARK: - Presets tính toán
    private var presetAfternoonToday: Date {
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.hour = 17
        comps.minute = 30
        let date = cal.date(from: comps) ?? Date()
        return date > Date() ? date : cal.date(byAdding: .hour, value: 2, to: Date()) ?? Date()
    }

    private var presetEveningToday: Date {
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.hour = 19
        comps.minute = 30
        let date = cal.date(from: comps) ?? Date()
        return date > Date() ? date : cal.date(byAdding: .hour, value: 3, to: Date()) ?? Date()
    }

    private var presetMorningTomorrow: Date {
        let cal = Calendar.current
        let tomorrow = cal.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        var comps = cal.dateComponents([.year, .month, .day], from: tomorrow)
        comps.hour = 9
        comps.minute = 0
        return cal.date(from: comps) ?? tomorrow
    }

    private var presetAfternoonTomorrow: Date {
        let cal = Calendar.current
        let tomorrow = cal.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        var comps = cal.dateComponents([.year, .month, .day], from: tomorrow)
        comps.hour = 17
        comps.minute = 0
        return cal.date(from: comps) ?? tomorrow
    }

    // MARK: - Formatters
    private func formatPickupDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.dateFormat = "HH:mm - EEEE, dd/MM"
        return formatter.string(from: date)
    }

    private func formatDeadlineDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.dateFormat = "HH:mm dd/MM"
        return formatter.string(from: date)
    }

    // MARK: - Realtime Listeners
    private func startRealtimeListeners() {
        let uid = currentUserId

        // 1. Lắng nghe tin nhắn
        messagesListener = FirestoreService.shared.observeMessages(chatId: activeChatId) { incomingMsgs in
            let mapped = incomingMsgs.map { msg -> ChatMessageItem in
                var m = msg
                m.isCurrentUser = (msg.senderId == uid)
                return m
            }
            withAnimation(.easeOut(duration: 0.2)) {
                self.messages = mapped
            }
        }

        // 2. Lắng nghe header hội thoại (chốt hẹn, trạng thái bàn giao)
        conversationListener = FirestoreService.shared.observeConversation(chatId: activeChatId) { conv in
            withAnimation(.easeOut(duration: 0.2)) {
                self.currentConversation = conv
            }
        }

        // 3. Lắng nghe trạng thái món đồ (reserved, completed, available)
        itemListener = FirestoreService.shared.observeItem(itemId: item.id) { updatedItem in
            if let updatedItem = updatedItem {
                withAnimation(.easeOut(duration: 0.2)) {
                    self.currentItem = updatedItem
                }
            }
        }
    }

    private func stopRealtimeListeners() {
        messagesListener?.remove()
        messagesListener = nil
        conversationListener?.remove()
        conversationListener = nil
        itemListener?.remove()
        itemListener = nil
    }

    // MARK: - Actions

    /// Gửi tin nhắn văn bản thông thường
    private func sendMessage(text: String) {
        let senderId = currentUserId
        let senderName = AuthService.shared.currentDisplayName ?? "Tôi"
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let timeStr = formatter.string(from: Date())

        let newMsg = ChatMessageItem(
            id: UUID().uuidString,
            senderId: senderId,
            senderName: senderName,
            text: text,
            timeString: timeStr,
            isCurrentUser: true,
            createdAt: Date(),
            messageType: "text"
        )

        // Cập nhật lạc quan giao diện
        if !messages.contains(where: { $0.id == newMsg.id }) {
            withAnimation {
                messages.append(newMsg)
            }
        }

        let donorId = activeItem.donorId.isEmpty ? "donor_pilot" : activeItem.donorId
        let donorName = activeItem.donorName
        let requesterId = (senderId == donorId) ? (activeConversation?.requesterId ?? "requester") : senderId
        let requesterName = (senderId == donorId) ? (activeConversation?.requesterName ?? "Người nhận đồ") : senderName

        let header = ChatConversation(
            id: activeChatId,
            itemId: activeItem.id,
            itemTitle: activeItem.title,
            itemImageName: activeItem.imageName,
            itemImageBase64: activeItem.imageBase64,
            itemImageUrl: activeItem.photoURLs.first,
            itemPickupAddress: activeItem.pickupAddress,
            donorId: donorId,
            donorName: donorName,
            requesterId: requesterId,
            requesterName: requesterName,
            participantIds: [donorId, requesterId],
            lastMessage: text,
            lastMessageTime: Date(),
            lastSenderId: senderId,
            isReserved: isReservedByThisChat,
            appointmentStatus: activeConversation?.appointmentStatus,
            proposedPickupTime: activeConversation?.proposedPickupTime,
            reservationDeadline: activeConversation?.reservationDeadline,
            donorHandoverConfirmed: donorHandoverConfirmed,
            requesterHandoverConfirmed: requesterHandoverConfirmed
        )

        Task {
            do {
                try await FirestoreService.shared.sendMessage(chatId: activeChatId, message: newMsg, conversationHeader: header)
                if conversation == nil && !didRefreshListenersAfterWrite {
                    // Listener mở trước khi chat tồn tại có thể bị rules từ chối; nối lại sau khi batch tạo chat.
                    await MainActor.run {
                        didRefreshListenersAfterWrite = true
                        stopRealtimeListeners()
                        startRealtimeListeners()
                    }
                }
                do {
                    try await FirestoreService.shared.markConversationAsRead(chatId: activeChatId, userId: senderId, messageTime: newMsg.createdAt)
                } catch {
                    print("⚠️ [Chat] Tin nhắn đã gửi nhưng không thể đánh dấu đã đọc: \(error.localizedDescription)")
                }
            } catch {
                await MainActor.run {
                    messages.removeAll { $0.id == newMsg.id }
                    if messageText.isEmpty { messageText = text }
                    alertTitle = "Không thể gửi tin nhắn"
                    actionErrorMessage = error.localizedDescription
                    showActionAlert = true
                }
            }
        }
    }

    /// Người nhận (B) gửi đề xuất hẹn giờ lấy đồ (món đồ vẫn available)
    private func handleSendAppointmentProposal() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.dateFormat = "HH:mm dd/MM"
        let timeStr = formatter.string(from: selectedAppointmentDate)

        let note = appointmentNote.trimmingCharacters(in: .whitespacesAndNewlines)
        let proposalText = note.isEmpty ?
            "📅 Đề xuất lịch hẹn nhận đồ lúc \(timeStr) tại \(activeItem.pickupAddress). Bạn có tiện khung giờ này không ạ?" :
            "📅 Đề xuất lịch hẹn nhận đồ lúc \(timeStr): \"\(note)\""

        let msgId = UUID().uuidString
        let newMsg = ChatMessageItem(
            id: msgId,
            senderId: currentUserId,
            senderName: AuthService.shared.currentDisplayName ?? "Người nhận đồ",
            text: proposalText,
            timeString: "Vừa xong",
            isCurrentUser: true,
            createdAt: Date(),
            messageType: "appointment_proposal",
            appointmentTime: selectedAppointmentDate,
            appointmentStatus: "pending"
        )

        let donorId = activeItem.donorId.isEmpty ? "donor_pilot" : activeItem.donorId
        let donorName = activeItem.donorName
        let requesterId = currentUserId
        let requesterName = AuthService.shared.currentDisplayName ?? "Người nhận đồ"

        let header = ChatConversation(
            id: activeChatId,
            itemId: activeItem.id,
            itemTitle: activeItem.title,
            itemImageName: activeItem.imageName,
            itemImageBase64: activeItem.imageBase64,
            itemImageUrl: activeItem.photoURLs.first,
            itemPickupAddress: activeItem.pickupAddress,
            donorId: donorId,
            donorName: donorName,
            requesterId: requesterId,
            requesterName: requesterName,
            participantIds: [donorId, requesterId],
            lastMessage: proposalText,
            lastMessageTime: Date(),
            lastSenderId: currentUserId,
            isReserved: false,
            appointmentStatus: "proposed",
            proposedPickupTime: selectedAppointmentDate
        )

        showAppointmentPickerSheet = false
        appointmentNote = ""

        Task {
            do {
                try await FirestoreService.shared.proposeAppointment(
                    chatId: activeChatId,
                    proposalMessage: newMsg,
                    conversationHeader: header
                )
                if conversation == nil && !didRefreshListenersAfterWrite {
                    await MainActor.run {
                        didRefreshListenersAfterWrite = true
                        stopRealtimeListeners()
                        startRealtimeListeners()
                    }
                }
            } catch {
                await MainActor.run {
                    self.alertTitle = "Lỗi gửi đề xuất"
                    self.actionErrorMessage = error.localizedDescription
                    self.showActionAlert = true
                }
            }
        }
    }

    /// Người cho (A) bấm "Đồng ý giữ đồ" -> Chạy Transaction khóa đồ nguyên tử
    private func handleAcceptAppointment(proposalMsg: ChatMessageItem) {
        guard let aptTime = proposalMsg.appointmentTime else { return }
        isProcessingAction = true

        let donorId = activeItem.donorId.isEmpty ? "donor_pilot" : activeItem.donorId
        let requesterId = proposalMsg.senderId
        let requesterName = proposalMsg.senderName

        let header = ChatConversation(
            id: activeChatId,
            itemId: activeItem.id,
            itemTitle: activeItem.title,
            itemImageName: activeItem.imageName,
            itemImageBase64: activeItem.imageBase64,
            itemImageUrl: activeItem.photoURLs.first,
            itemPickupAddress: activeItem.pickupAddress,
            donorId: donorId,
            donorName: activeItem.donorName,
            requesterId: requesterId,
            requesterName: requesterName,
            participantIds: [donorId, requesterId],
            lastMessage: "",
            lastMessageTime: Date(),
            lastSenderId: "system",
            isReserved: true,
            appointmentStatus: "accepted",
            proposedPickupTime: aptTime
        )

        Task {
            do {
                try await FirestoreService.shared.acceptAppointment(
                    chatId: activeChatId,
                    itemId: activeItem.id,
                    donorId: currentUserId,
                    proposalMessageId: proposalMsg.id,
                    pickupTime: aptTime,
                    conversationHeader: header
                )
                await MainActor.run {
                    self.isProcessingAction = false
                }
            } catch {
                await MainActor.run {
                    self.isProcessingAction = false
                    self.alertTitle = "Không thể chốt hẹn"
                    self.actionErrorMessage = error.localizedDescription
                    self.showActionAlert = true
                }
            }
        }
    }

    /// Người cho (A) từ chối đề xuất
    private func handleDeclineAppointment(proposalMsg: ChatMessageItem) {
        isProcessingAction = true
        Task {
            do {
                try await FirestoreService.shared.declineAppointment(
                    chatId: activeChatId,
                    proposalMessageId: proposalMsg.id,
                    donorId: currentUserId
                )
                await MainActor.run {
                    self.isProcessingAction = false
                }
            } catch {
                await MainActor.run {
                    self.isProcessingAction = false
                    self.alertTitle = "Lỗi thao tác"
                    self.actionErrorMessage = error.localizedDescription
                    self.showActionAlert = true
                }
            }
        }
    }

    /// Xác nhận bàn giao 2 bên (Cả hai bên đều phải bấm mới hoàn tất món đồ)
    private func handleConfirmHandover() {
        isProcessingAction = true
        Task {
            do {
                _ = try await FirestoreService.shared.confirmHandover(
                    chatId: activeChatId,
                    itemId: activeItem.id,
                    actorId: currentUserId
                )
                await MainActor.run {
                    self.isProcessingAction = false
                }
            } catch {
                await MainActor.run {
                    self.isProcessingAction = false
                    self.alertTitle = "Lỗi xác nhận bàn giao"
                    self.actionErrorMessage = error.localizedDescription
                    self.showActionAlert = true
                }
            }
        }
    }

    /// Hủy lịch hẹn và mở lại món đồ sang Available
    private func handleCancelReservation() {
        isProcessingAction = true
        let cancelMsg = ChatMessageItem(
            id: UUID().uuidString,
            senderId: currentUserId,
            senderName: currentUserId == activeItem.donorId ? "Người cho" : "Người nhận",
            text: "⚠️ Lịch hẹn đã được hủy. Món đồ được mở lại ở trạng thái 'Sẵn sàng nhận đồ' cho những người khác.",
            timeString: "Vừa xong",
            isCurrentUser: false,
            createdAt: Date(),
            messageType: "text"
        )

        Task {
            do {
                try await FirestoreService.shared.cancelReservation(
                    chatId: activeChatId,
                    itemId: activeItem.id,
                    operatorUserId: currentUserId,
                    cancelMessage: cancelMsg
                )
                await MainActor.run {
                    self.isProcessingAction = false
                }
            } catch {
                await MainActor.run {
                    self.isProcessingAction = false
                    self.alertTitle = "Lỗi hủy lịch hẹn"
                    self.actionErrorMessage = error.localizedDescription
                    self.showActionAlert = true
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        ChatConversationView(
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
