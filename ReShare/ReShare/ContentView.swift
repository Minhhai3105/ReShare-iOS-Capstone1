import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false

    var body: some View {
        Group {
            if appState.isRestoringSession {
                ProgressView("Đang kiểm tra tài khoản...")
            } else if appState.isAuthenticated {
                MainTabView()
            } else if !hasSeenOnboarding {
                OnboardingView { hasSeenOnboarding = true }
            } else {
                LoginView()
            }
        }
        .task { await appState.restoreSession() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await appState.validateCurrentSession() }
                CatalogPublishQueue.shared.resume()
            }
        }
        .preferredColorScheme(.light)
        // Cỡ chữ co giãn theo cài đặt iPhone (scaledFont) nhưng chặn ở xxLarge để bố cục không vỡ.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
