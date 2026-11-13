import SwiftUI
import FirebaseAuth

/// Quên mật khẩu: gửi thư đặt lại mật khẩu qua Firebase Auth.
/// Thông báo trung lập ("nếu email có tài khoản…") để không lộ email nào đã đăng ký.
struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State var email: String

    @State private var isSending = false
    @State private var didSend = false
    @State private var errorMessage: String?
    @FocusState private var emailFocused: Bool

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSend: Bool { trimmedEmail.contains("@") && !isSending }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                if didSend {
                    Label("Đã gửi yêu cầu", systemImage: "envelope.badge.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(AppColors.primary)
                    Text("Nếu \(trimmedEmail) có tài khoản ReShare, bạn sẽ nhận được thư đặt lại mật khẩu trong vài phút. Kiểm tra cả mục Spam hoặc Quảng cáo. Mở liên kết trong thư để đặt mật khẩu mới rồi quay lại đăng nhập.")
                        .font(.system(size: 15))
                        .foregroundColor(AppColors.textPrimary)
                    Button("Gửi lại") {
                        didSend = false
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(AppColors.primary)
                    .frame(minHeight: 44)
                } else {
                    Text("Nhập email bạn dùng để đăng nhập. ReShare sẽ gửi liên kết đặt lại mật khẩu tới email này.")
                        .font(.system(size: 15))
                        .foregroundColor(AppColors.textSecondary)

                    TextField("Địa chỉ email", text: $email)
                        .font(.system(size: 15))
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($emailFocused)
                        .submitLabel(.send)
                        .onSubmit(send)
                        .padding(.horizontal, 14)
                        .frame(height: 52)
                        .background(Color.white)
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(AppColors.border.opacity(0.8), lineWidth: 1))

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(AppColors.rejected)
                    }

                    Button(action: send) {
                        HStack(spacing: 8) {
                            if isSending { ProgressView().tint(.white) }
                            Text(isSending ? "Đang gửi…" : "Gửi liên kết đặt lại")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(canSend ? AppColors.primary : AppColors.border)
                        .foregroundColor(.white)
                        .cornerRadius(16)
                    }
                    .disabled(!canSend)
                }
                Spacer()
            }
            .padding(20)
            .background(AppColors.background.ignoresSafeArea())
            .navigationTitle("Quên mật khẩu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(didSend ? "Xong" : "Huỷ") { dismiss() }
                        .disabled(isSending)
                }
            }
            .onAppear { if trimmedEmail.isEmpty { emailFocused = true } }
        }
    }

    private func send() {
        guard canSend else { return }
        emailFocused = false
        errorMessage = nil
        isSending = true
        Task {
            do {
                try await AuthService.shared.sendPasswordReset(email: trimmedEmail)
                didSend = true
            } catch let error as NSError
                where error.domain == AuthErrorDomain && AuthErrorCode(rawValue: error.code) == .userNotFound {
                // Chống dò email: tài khoản không tồn tại vẫn báo như đã gửi.
                didSend = true
            } catch {
                errorMessage = Self.message(for: error)
            }
            isSending = false
        }
    }

    private static func message(for error: Error) -> String {
        let nsError = error as NSError
        guard nsError.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: nsError.code) else {
            return "Chưa gửi được yêu cầu. Vui lòng thử lại."
        }
        switch code {
        case .invalidEmail, .missingEmail: return "Địa chỉ email không đúng định dạng."
        case .networkError: return "Không có kết nối mạng. Vui lòng kiểm tra và thử lại."
        case .tooManyRequests: return "Bạn đã yêu cầu quá nhiều lần. Vui lòng chờ một lúc rồi thử lại."
        default: return "Chưa gửi được yêu cầu. Vui lòng thử lại."
        }
    }
}

#Preview {
    ForgotPasswordView(email: "")
}
