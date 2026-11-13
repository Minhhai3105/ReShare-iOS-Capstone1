import SwiftUI

/// Danh sách người dùng đã chặn (App Store Guideline 1.2). Bỏ chặn được ở đây kể cả khi hai bên chưa
/// từng nhắn tin — chặn từ trang chi tiết bài đăng thì không có cuộc trò chuyện nào để bỏ chặn.
struct BlockedUsersView: View {
    @State private var users: [BlockedUser] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var pendingId: String?

    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)

    var body: some View {
        List {
            if let actionError {
                Section { Text(actionError).foregroundColor(.red).font(.system(size: 14)) }
            }
            if isLoading && users.isEmpty {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Đang tải danh sách…").foregroundColor(.secondary)
                }
            } else if let loadError {
                Section {
                    Text(loadError).foregroundColor(.red).font(.system(size: 14))
                    Button("Thử lại") { Task { await load() } }
                        .frame(minHeight: 44)
                }
            } else if users.isEmpty {
                Text("Bạn chưa chặn ai.").foregroundColor(.secondary)
            } else {
                Section {
                    ForEach(users) { user in
                        row(user)
                    }
                } footer: {
                    Text("Người bị chặn không nhắn tin được cho bạn và bài của họ bị ẩn khỏi Kho đồ 0đ của bạn. ReShare không báo cho họ biết.")
                }
            }
        }
        .navigationTitle("Người dùng đã chặn")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ user: BlockedUser) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(.system(size: 15, weight: .semibold))
                if let date = user.blockedAt {
                    Text("Đã chặn ngày \(date.formatted(date: .abbreviated, time: .omitted))")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            Button(pendingId == user.id ? "Đang bỏ…" : "Bỏ chặn") { unblock(user) }
                .buttonStyle(.bordered)
                .tint(primaryGreen)
                .frame(minHeight: 44)
                .disabled(pendingId != nil)
                .accessibilityLabel("Bỏ chặn \(user.displayName)")
        }
    }

    private func load() async {
        isLoading = true
        loadError = nil
        do {
            users = try await FirestoreService.shared.fetchBlockedUsers()
        } catch {
            loadError = "Chưa tải được danh sách. Kiểm tra kết nối rồi thử lại."
        }
        isLoading = false
    }

    private func unblock(_ user: BlockedUser) {
        pendingId = user.id
        actionError = nil
        Task {
            do {
                try await FirestoreService.shared.unblockUser(user.id)
                users.removeAll { $0.id == user.id }
            } catch {
                actionError = "Chưa bỏ chặn được \(user.displayName). Kiểm tra kết nối rồi thử lại."
            }
            pendingId = nil
        }
    }
}

#Preview {
    NavigationStack { BlockedUsersView() }
}
