import SwiftUI
import FirebaseFirestore

/// Màn hình Quản lý Hộp thư Tin nhắn Realtime (Tab 4 của ứng dụng)
struct ConversationsListView: View {
    var filteredItemId: String? = nil
    var filterItemTitle: String? = nil
    
    @State private var selectedFilter: String = "Tất cả"
    private let filters = ["Tất cả", "Khách xin đồ tôi", "Đồ tôi đang xin", "Đã chốt hẹn"]
    
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)
    
    // Dữ liệu cuộc trò chuyện thời gian thực từ Cloud Firestore (100% Real Data)
    @State private var conversations: [ChatConversation] = []
    @State private var listenerRegistration: ListenerRegistration? = nil
    
    private var currentUserId: String {
        AuthService.shared.currentUserId ?? ""
    }
    
    var filteredConversations: [ChatConversation] {
        var list = conversations
        if let itemId = filteredItemId, !itemId.isEmpty {
            list = list.filter { $0.itemId == itemId }
        }
        
        switch selectedFilter {
        case "Khách xin đồ tôi":
            return list.filter { $0.donorId == currentUserId }
        case "Đồ tôi đang xin":
            return list.filter { $0.requesterId == currentUserId }
        case "Đã chốt hẹn":
            return list.filter { $0.isReserved }
        default:
            return list
        }
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Banner thông báo nếu đang lọc riêng theo 1 món đồ
                if let title = filterItemTitle {
                    HStack(spacing: 8) {
                        Image(systemName: "line.3.horizontal.decrease.circle.fill")
                            .foregroundColor(primaryGreen)
                        Text("Người hỏi xin: \(title)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(primaryGreen)
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(softMint)
                }
                
                // Bộ lọc ngang
                filterSection
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                
                if filteredConversations.isEmpty {
                    emptyStateView
                } else {
                    List {
                        ForEach(filteredConversations) { conv in
                            NavigationLink(destination: ChatConversationView(
                                item: conv.asCatalogItem,
                                conversation: conv,
                                customChatId: conv.id
                            )) {
                                conversationRow(for: conv)
                            }
                            .listRowInsets(EdgeInsets(top: 10, leading: 18, bottom: 10, trailing: 18))
                            .listRowBackground(Color.white)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Tin nhắn")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                startRealtimeListener()
            }
            .onDisappear {
                listenerRegistration?.remove()
                listenerRegistration = nil
            }
        }
    }
    
    private func startRealtimeListener() {
        guard !currentUserId.isEmpty else { return }
        listenerRegistration?.remove()
        listenerRegistration = FirestoreService.shared.observeUserConversations(userId: currentUserId) { liveConvs in
            withAnimation(.easeOut(duration: 0.25)) {
                self.conversations = liveConvs
            }
        }
    }
    
    private var filterSection: some View {
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
                            .padding(.vertical, 7)
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
    
    private func conversationRow(for conv: ChatConversation) -> some View {
        let isMyDonation = (conv.donorId == currentUserId)
        let hasNewIncoming = conv.hasUnread(for: currentUserId)
        
        return HStack(alignment: .center, spacing: 12) {
            // Avatar người chat kèm chấm đỏ báo tin mới
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle()
                        .fill(isMyDonation ? Color(red: 0.11, green: 0.35, blue: 0.20) : Color.blue.opacity(0.8))
                        .frame(width: 48, height: 48)
                    Text(conv.partnerInitials(currentUserId: currentUserId))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                }
                
                if hasNewIncoming {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                        .offset(x: 2, y: -2)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(conv.partnerName(currentUserId: currentUserId))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                    
                    // Nhãn phân định vai trò rõ ràng
                    if isMyDonation {
                        Text("Khách xin")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(primaryGreen)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(softMint)
                            .clipShape(Capsule())
                    } else {
                        Text("Người cho")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.blue)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.1))
                            .clipShape(Capsule())
                    }
                    
                    if conv.appointmentStatus == "completed" {
                        Text("Đã tặng")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(primaryGreen)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(primaryGreen.opacity(0.12))
                            .clipShape(Capsule())
                    } else if conv.isReserved {
                        Text("Đã hẹn")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.orange)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.12))
                            .clipShape(Capsule())
                    } else if conv.appointmentStatus == "proposed" {
                        Text("Đang hẹn")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.purple)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.purple.opacity(0.12))
                            .clipShape(Capsule())
                    }
                    
                    Spacer()
                    
                    Text(formatTime(conv.lastMessageTime))
                        .font(.system(size: 11, weight: hasNewIncoming ? .bold : .regular))
                        .foregroundColor(hasNewIncoming ? primaryGreen : .secondary)
                }
                
                // Món đồ liên quan
                HStack(spacing: 4) {
                    Image(systemName: isMyDonation ? "arrow.up.heart.fill" : "arrow.down.heart.fill")
                        .font(.system(size: 10))
                        .foregroundColor(isMyDonation ? primaryGreen : .blue)
                    Text(isMyDonation ? "Món của bạn: \(conv.itemTitle)" : "Đang xin: \(conv.itemTitle)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                // Nội dung tin nhắn cuối cùng
                Text(conv.lastMessage)
                    .font(.system(size: 12, weight: hasNewIncoming ? .semibold : .regular))
                    .foregroundColor(hasNewIncoming ? .primary : .secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundColor(.secondary.opacity(0.35))
            Text("Chưa có tin nhắn phù hợp")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(primaryGreen)
            Text(emptyMessageForFilter)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.horizontal, 36)
            Spacer()
        }
    }
    
    private var emptyMessageForFilter: String {
        switch selectedFilter {
        case "Khách xin đồ tôi":
            return "Chưa có ai nhắn tin xin các món đồ bạn đăng tặng. Khi có người hỏi xin, tin nhắn sẽ hiển thị tại đây kèm thông báo."
        case "Đồ tôi đang xin":
            return "Bạn chưa nhắn tin xin món đồ nào từ Kho đồ 0đ. Hãy dạo Kho đồ 0đ và nhắn tin cho người cho nhé!"
        case "Đã chốt hẹn":
            return "Chưa có cuộc trò chuyện nào được chốt lịch hẹn nhận đồ."
        default:
            return "Khi bạn nhắn tin xin đồ từ Kho đồ 0đ hoặc có người khác nhắn tin xin món đồ bạn đăng tặng, cuộc trò chuyện sẽ tự động xuất hiện tại đây theo thời gian thực."
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            return formatter.string(from: date)
        } else if calendar.isDateInYesterday(date) {
            return "Hôm qua"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "dd/MM"
            return formatter.string(from: date)
        }
    }
}

#Preview {
    ConversationsListView()
}
