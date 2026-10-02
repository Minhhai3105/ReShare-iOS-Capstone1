import SwiftUI
import FirebaseFirestore

struct UserProfileView: View {
    @EnvironmentObject private var appState: AppState
    @State private var displayName = ""
    @State private var phoneNumber = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Thông tin cá nhân") {
                    Text(appState.currentUserProfile?.email ?? "")
                        .foregroundStyle(.secondary)
                    TextField("Họ và tên", text: $displayName)
                        .textContentType(.name)
                    TextField("Số điện thoại", text: $phoneNumber)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(AppColors.rejected)
                }
                if let successMessage {
                    Text(successMessage).foregroundStyle(AppColors.primary)
                }

                Button {
                    saveProfile()
                } label: {
                    if isSaving { ProgressView() }
                    else { Text("Lưu hồ sơ") }
                }
                .disabled(isSaving)

                Button("Đăng xuất", role: .destructive) {
                    do {
                        try appState.logout()
                    } catch {
                        errorMessage = "Không thể đăng xuất. Vui lòng thử lại."
                    }
                }
                .disabled(isSaving)
            }
            .navigationTitle("Hồ sơ của tôi")
            .onAppear {
                displayName = appState.currentUserProfile?.displayName ?? ""
                phoneNumber = appState.currentUserProfile?.phoneNumber ?? ""
            }
        }
    }

    private func saveProfile() {
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let phone = phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80, phone.count <= 32 else {
            errorMessage = "Tên phải có 1–80 ký tự và số điện thoại tối đa 32 ký tự."
            return
        }
        isSaving = true
        errorMessage = nil
        successMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await appState.updateProfile(displayName: name, phoneNumber: phone)
                successMessage = "Đã lưu hồ sơ."
            } catch {
                let nsError = error as NSError
                if nsError.domain == FirestoreErrorDomain,
                   [FirestoreErrorCode.unavailable.rawValue, FirestoreErrorCode.deadlineExceeded.rawValue].contains(nsError.code) {
                    errorMessage = "Không có kết nối mạng. Hồ sơ chưa được lưu; vui lòng thử lại khi có mạng."
                } else {
                    errorMessage = "Không thể lưu hồ sơ. Vui lòng thử lại."
                }
            }
        }
    }
}
