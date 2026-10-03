import SwiftUI

enum Tab: Int, CaseIterable {
    case home = 0
    case catalog = 1
    case donate = 2
    case messages = 3
    case profile = 4
}

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedTab: Tab = .home
    
    var body: some View {
        ZStack(alignment: .top) {
            TabView(selection: $selectedTab) {
                // Tab 1: Trang chủ
                NavigationStack {
                    HomeView()
                }
                .tabItem {
                    Label("Trang chủ", systemImage: selectedTab == .home ? "house.fill" : "house")
                }
                .tag(Tab.home)

                // Tab 2: Kho đồ 0đ (Catalog P2P)
                NavigationStack {
                    CommunityCatalogView()
                }
                .tabItem {
                    Label("Kho đồ 0đ", systemImage: selectedTab == .catalog ? "archivebox.fill" : "archivebox")
                }
                .tag(Tab.catalog)

                // Tab 3: Chiến dịch (Chiến dịch do Kho/Admin phát động)
                NavigationStack {
                    DonationCampaignsView()
                }
                .tabItem {
                    Label("Chiến dịch", systemImage: selectedTab == .donate ? "heart.text.square.fill" : "heart.text.square")
                }
                .tag(Tab.donate)

                // Tab 4: Tin nhắn (Hộp thư trao đổi xin/cho đồ)
                ConversationsListView()
                    .tabItem {
                        Label("Tin nhắn", systemImage: selectedTab == .messages ? "message.fill" : "message")
                    }
                    .badge(appState.unreadMessagesCount > 0 ? "\(appState.unreadMessagesCount)" : nil)
                    .tag(Tab.messages)

                // Tab 5: Cá nhân (Profile)
                ProfileView(isRootTab: true)
                    .tabItem {
                        Label("Cá nhân", systemImage: selectedTab == .profile ? "person.fill" : "person")
                    }
                    .tag(Tab.profile)
            }
            
            // In-App Toast Notification Banner khi có tin nhắn mới gửi đến
            if let notif = appState.activeInAppNotification {
                toastNotificationBanner(notif: notif)
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
                    .zIndex(999)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: appState.activeInAppNotification)
    }
    
    private func toastNotificationBanner(notif: InAppMessageNotification) -> some View {
        Button(action: {
            selectedTab = .messages
            appState.activeInAppNotification = nil
        }) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.11, green: 0.35, blue: 0.20))
                        .frame(width: 40, height: 40)
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.white)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(notif.senderName)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                        Text("•")
                            .foregroundColor(.secondary)
                        Text(notif.itemTitle)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                            .lineLimit(1)
                    }
                    
                    Text(notif.messageText)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white)
                    .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 4)
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .buttonStyle(PlainButtonStyle())
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4.5) {
                withAnimation {
                    if appState.activeInAppNotification?.id == notif.id {
                        appState.activeInAppNotification = nil
                    }
                }
            }
        }
    }
}

#Preview {
    MainTabView()
}
