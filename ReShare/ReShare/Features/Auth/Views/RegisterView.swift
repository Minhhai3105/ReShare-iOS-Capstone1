import SwiftUI

struct RegisterView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AuthViewModel()
    
    @State private var confirmPassword: String = ""
    @State private var isAgreeToTerms: Bool = false
    
    @State private var isPasswordVisible: Bool = false
    @State private var isConfirmPasswordVisible: Bool = false
    
    var onNavigateToLogin: (() -> Void)?
    
    var body : some View {
        ZStack {
            // Nền phủ full màn hình
            AppColors.background.ignoresSafeArea()
            
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    topBarView
                        .padding(.top, 8)
                    
                    headerTitleView
                        .padding(.top, 4)
                    
                    formFieldsView
                        // Lỗi từ lần bấm trước (vd: email sai định dạng, email đã dùng) không còn đúng khi người dùng đã sửa ô.
                        .onChange(of: viewModel.fullName) { viewModel.errorMessage = nil }
                        .onChange(of: viewModel.email) { viewModel.errorMessage = nil }
                        .onChange(of: viewModel.phoneNumber) { viewModel.errorMessage = nil }
                        .onChange(of: viewModel.password) { viewModel.errorMessage = nil }
                        .onChange(of: confirmPassword) { viewModel.errorMessage = nil }
                    
                    termsCheckboxView
                    
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .scaledFont(size: 13, weight: .medium)
                            .foregroundColor(AppColors.rejected)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    
                    createAccountButton
                        .padding(.top, 6)
                    
                    loginLinkView
                        .padding(.top, 8)
                        
                    trustBadgeView
                        .padding(.top, 10)
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, 20)
                
            }
        }
        .navigationBarHidden(true)
    }
    
    private var topBarView: some View {
        HStack {
            Button(action: { dismiss()}) {
                Image(systemName: "chevron.left")
                    .scaledFont(size: 14, weight: .semibold)
                    .foregroundStyle(AppColors.primary)
                    .frame(width: 38, height: 38)
                    .background(Color.white)
                    .clipShape(Circle())
                    .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
            }
            .accessibilityLabel("Quay lại")
            
            Spacer()
            
            HStack(spacing: 5) {
                // Logo ReShare (cùng asset với Splash/Onboarding và icon app)
                Image("AvatarApp")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .accessibilityHidden(true)
                
                Text("ReShare VN")
                    .scaledFont(size: 13, weight: .semibold, design: .rounded)
                    .foregroundStyle(AppColors.primary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(AppColors.primarySoft)
            .clipShape(Capsule())
            
            Spacer()
            
            Color.clear.frame(width: 38, height: 38)
        }
    }
    
    private var headerTitleView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tạo tài khoản")
                .scaledFont(size: 30, weight: .bold, design: .rounded)
                .foregroundColor(AppColors.textPrimary)
            Text("Tham gia cộng đồng ReShare để quyên góp và trao tặng đồ dùng còn tốt.")
                .scaledFont(size: 14, weight: .regular)
                .foregroundColor(AppColors.textSecondary)
                .lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // FULL
    private var formFieldsView: some View {
        VStack(spacing: 16) {
            // Full name
            inputSection(title: "Họ và tên") {
                HStack(spacing: 12) {
                    Image(systemName: "person")
                        .scaledFont(size: 17)
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    TextField("Ví dụ: Nguyễn Văn An", text: $viewModel.fullName)
                        .scaledFont(size: 15)
                }
            }
            
            // Email
            inputSection(title: "Email") {
                HStack(spacing: 12) {
                    Image(systemName: "envelope")
                        .scaledFont(size: 17)
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    TextField("Địa chỉ email", text: $viewModel.email)
                        .scaledFont(size: 15)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                }
            }
            
            // Số điện thoại: không bắt buộc (PhoneNumberRule)
            inputSection(title: "Số điện thoại (không bắt buộc)") {
                HStack(spacing: 8) {
                    Image(systemName: "iphone")
                        .scaledFont(size: 17)
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    HStack(spacing: 4) {
                        Text(" +84")
                            .scaledFont(size: 15, weight: .semibold, design: .rounded)
                            .foregroundColor(AppColors.textPrimary)
                        
                        Divider()
                            .frame(height: 18)
                            .background(AppColors.border)
                    }
                    .padding(.trailing, 4)
                    
                    TextField("012 345 6789", text: $viewModel.phoneNumber)
                        .scaledFont(size: 15)
                        .keyboardType(.phonePad)
                }
            }
            if !PhoneNumberRule.isValid(viewModel.phoneNumber) {
                Text(PhoneNumberRule.invalidMessage)
                    .scaledFont(size: 12)
                    .foregroundColor(AppColors.rejected)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            
            // Password
            inputSection(title: "Mật khẩu") {
                HStack(spacing: 12) {
                    Image(systemName: "lock")
                        .scaledFont(size: 17)
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    if isPasswordVisible {
                        TextField("Ít nhất 8 ký tự", text: $viewModel.password)
                            .scaledFont(size: 15)
                            .textContentType(.none)
                    } else {
                        SecureField("Ít nhất 8 ký tự", text: $viewModel.password)
                            .scaledFont(size: 15)
                    }
                    
                    Button(action: {
                        isPasswordVisible.toggle()
                    }) {
                        Image(systemName: isPasswordVisible ? "eye" : "eye.slash")
                            .scaledFont(size: 15)
                            .foregroundStyle(AppColors.textTertiary)
                    }
                    .accessibilityLabel(isPasswordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu")
                }
            }
            
            if isPasswordTooShort {
                Text("Mật khẩu cần ít nhất 8 ký tự.")
                    .scaledFont(size: 12)
                    .foregroundColor(AppColors.rejected)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            
            // Confirm Password
            inputSection(title: "Nhập lại mật khẩu") {
                HStack(spacing: 12) {
                    Image(systemName: "ellipsis.rectangle")
                        .scaledFont(size: 17)
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    if isConfirmPasswordVisible {
                        TextField("Nhập lại mật khẩu", text: $confirmPassword)
                            .scaledFont(size: 15)
                            .autocapitalization(.none)
                    } else {
                        SecureField("Nhập lại mật khẩu", text: $confirmPassword)
                            .scaledFont(size: 15)
                    }
                    
                    Button(action: { isConfirmPasswordVisible.toggle() }) {
                        Image(systemName: isConfirmPasswordVisible ? "eye" : "eye.slash")
                            .scaledFont(size: 15)
                            .foregroundStyle(AppColors.textTertiary)
                    }
                    .accessibilityLabel(isConfirmPasswordVisible ? "Ẩn mật khẩu nhập lại" : "Hiện mật khẩu nhập lại")
                }
            }
            if !confirmPassword.isEmpty && viewModel.password != confirmPassword {
                Text("Mật khẩu xác nhận không khớp.")
                    .scaledFont(size: 12)
                    .foregroundColor(AppColors.rejected)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
    
    private func inputSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .scaledFont(size: 14, weight: .semibold)
                .foregroundColor(AppColors.textPrimary)
            
            HStack {
                content()
            }
            .padding(.horizontal, 14)
            .frame(height: 52)
            .background(Color.white)
            .cornerRadius(14)
            .shadow(color: Color.black.opacity(0.02), radius: 6, x: 0, y: 2)
        }
    }
    
    // Đồng ý điều khoản trước khi tạo tài khoản (App Store Guideline 1.2: người dùng phải đồng ý
    // điều khoản không dung thứ nội dung xấu). Hai link mở trang pháp lý trên website.
    private var termsAgreementText: AttributedString {
        let markdown = "Tôi đủ 16 tuổi (hoặc có cha mẹ, người giám hộ đồng ý) và đồng ý với "
            + "[Điều khoản sử dụng](\(Constants.Links.termsOfUse.absoluteString)) cùng "
            + "[Chính sách quyền riêng tư](\(Constants.Links.privacyPolicy.absoluteString)) của ReShare."
        return (try? AttributedString(markdown: markdown)) ?? AttributedString(markdown)
    }

    private var termsCheckboxView: some View {
        HStack(alignment: .top, spacing: 6) {
            Button(action: { isAgreeToTerms.toggle() }) {
                Image(systemName: isAgreeToTerms ? "checkmark.square.fill" : "square")
                    .scaledFont(size: 20)
                    .foregroundColor(isAgreeToTerms ? AppColors.primary : AppColors.textTertiary)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Đồng ý điều khoản sử dụng và chính sách quyền riêng tư")
            .accessibilityValue(isAgreeToTerms ? "Đã chọn" : "Chưa chọn")

            Text(termsAgreementText)
                .scaledFont(size: 13)
                .foregroundColor(AppColors.textSecondary)
                .tint(AppColors.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    private var createAccountButton: some View {
        Button(action: handleCreateAccount) {
            HStack(spacing: 8) {
                if viewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Tạo tài khoản")
                            .scaledFont(size: 16, weight: .semibold, design: .rounded)
                    Image(systemName: "arrow.right")
                        .scaledFont(size: 14, weight: .semibold)
                        
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(isFormValid ? AppColors.primary : AppColors.border)
            .foregroundColor(.white)
            .cornerRadius(16)
            .shadow(color: isFormValid ? AppColors.primary.opacity(0.3) : Color.clear, radius: 10, x: 0, y: 4)
            
        }
        .disabled(!isFormValid || viewModel.isLoading)
    }
    
    // Link Đăng Nhập
    private var loginLinkView: some View {
        HStack(spacing: 5) {
            Text("Đã có tài khoản?")
                .scaledFont(size: 14)
                .foregroundColor(AppColors.textSecondary)
            
            Button("Đăng nhập") {
                if let onNavigateToLogin = onNavigateToLogin {
                    onNavigateToLogin()
                } else {
                    dismiss()
                }
            }
            .scaledFont(size: 14, weight: .bold)
            .foregroundColor(AppColors.primary)
        }
    }
    
    //
    private var trustBadgeView: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield.fill")
                .scaledFont(size: 13)
                .foregroundColor(AppColors.primary)
                .accessibilityHidden(true)
            
            Text("Có báo cáo vi phạm và chặn người dùng để giữ cộng đồng an toàn")
                .scaledFont(size: 11, weight: .medium)
                .foregroundColor(AppColors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(AppColors.primarySoft.opacity(0.6))
        .cornerRadius(12)
    }
    
    // MARK:
    
    /// Đã gõ mật khẩu nhưng chưa đủ 8 ký tự: nút Tạo tài khoản bị khoá nên phải nói rõ lý do.
    private var isPasswordTooShort: Bool {
        !viewModel.password.isEmpty && viewModel.password.count < 8
    }
    
    private var isFormValid: Bool {
        !viewModel.fullName.trimmingCharacters(in: .whitespaces).isEmpty &&
        !viewModel.email.trimmingCharacters(in: .whitespaces).isEmpty &&
        PhoneNumberRule.isValid(viewModel.phoneNumber) &&
        viewModel.password.count >= 8 &&
        viewModel.password == confirmPassword &&
        isAgreeToTerms
    }
    
    private func handleCreateAccount() {
        guard viewModel.password == confirmPassword else {
            viewModel.errorMessage = "Mật khẩu xác nhận không khớp!"
            return
        }
        guard isAgreeToTerms else {
            viewModel.errorMessage = "Vui lòng đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư"
            return
        }
        viewModel.register(appState: appState)
    }
}

#Preview {
    RegisterView()
        .environmentObject(AppState())
}
