//
//  ReShareApp.swift
//  ReShare
//
//  Created by Cao Hai on 23/8/26.
//

import SwiftUI
import FirebaseCore

@main
struct ReShareApp: App {
    @StateObject private var appState = AppState()
    
    // Khởi tạo Firebase khi ứng dụng được nạp, nhưng bỏ qua trong SwiftUI Preview
    init() {
        let isRunningPreviews = ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
        if !isRunningPreviews, FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}
