import SwiftUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var didSubmit = false
    @State private var isSaving = false
    @State private var showSuccess = false
    @State private var requestError: String?
    @FocusState private var isEditing: Bool

    private var validationError: String? {
        if currentPassword.isEmpty { return "Vui lòng nhập mật khẩu hiện tại." }
        if newPassword.count < 8 { return "Mật khẩu mới phải có ít nhất 8 ký tự." }
        if newPassword.utf8.elementsEqual(currentPassword.utf8) { return "Mật khẩu mới phải khác mật khẩu hiện tại." }
        if !newPassword.utf8.elementsEqual(confirmation.utf8) { return "Mật khẩu nhập lại không khớp." }
        return nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    passwordField("Mật khẩu hiện tại", text: $currentPassword, contentType: .password)
                    passwordField("Mật khẩu mới", text: $newPassword, contentType: .newPassword)
                    passwordField("Nhập lại mật khẩu mới", text: $confirmation, contentType: .newPassword)

                    if let error = (didSubmit ? validationError : nil) ?? requestError {
                        Text(error)
                            .scaledFont(size: 13, weight: .medium)
                            .foregroundStyle(AppColors.rejected)
                    }

                    Button(action: changePassword) {
                        HStack(spacing: 8) {
                            if isSaving { ProgressView().tint(.white) }
                            Text(isSaving ? "Đang đổi mật khẩu…" : "Đổi mật khẩu")
                                .scaledFont(size: 16, weight: .semibold)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(.white)
                        .background(AppColors.primary.opacity(isSaving ? 0.55 : 1), in: RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(isSaving)
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(AppColors.background.ignoresSafeArea())
            .navigationTitle("Đổi mật khẩu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng") { dismiss() }
                        .disabled(isSaving)
                }
            }
            .alert("Đã đổi mật khẩu", isPresented: $showSuccess) {
                Button("Xong") { dismiss() }
            }
        }
        .interactiveDismissDisabled(isSaving)
        .onDisappear(perform: clearPasswords)
    }

    private func passwordField(_ label: String, text: Binding<String>, contentType: UITextContentType) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .scaledFont(size: 14, weight: .semibold)
                .foregroundStyle(AppColors.textPrimary)
            SecureField(label, text: text)
                .textContentType(contentType)
                .focused($isEditing)
                .disabled(isSaving)
                .padding(14)
                .background(.background, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(AppColors.border, lineWidth: 1))
        }
    }

    private func clearPasswords() {
        currentPassword = ""
        newPassword = ""
        confirmation = ""
    }

    private func changePassword() {
        guard !isSaving else { return }
        didSubmit = true
        requestError = nil
        guard validationError == nil else { return }
        isEditing = false
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await AuthService.shared.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                didSubmit = false
                clearPasswords()
                showSuccess = true
            } catch {
                requestError = (error as? AuthService.PasswordChangeError)?.errorDescription
                    ?? "Chưa đổi được mật khẩu. Vui lòng thử lại sau."
            }
        }
    }
}
