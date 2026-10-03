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
            }
        }
        .preferredColorScheme(.light)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
