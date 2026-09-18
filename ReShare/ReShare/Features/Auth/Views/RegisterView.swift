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
                    
                    termsCheckboxView
                    
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.system(size: 13, weight: .medium))
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
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppColors.primary)
                    .frame(width: 38, height: 38)
                    .background(Color.white)
                    .clipShape(Circle())
                    .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
            }
            
            Spacer()
            
            HStack(spacing: 5) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(AppColors.primary)
                
                Text("ReShare VN")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
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
            Text("Create Account")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(AppColors.textPrimary)
            Text("Join our verified community to share and receive pre-loved items with care.")
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(AppColors.textSecondary)
                .lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // FULL
    private var formFieldsView: some View {
        VStack(spacing: 16) {
            // Full name
            inputSection(title: "Full Name") {
                HStack(spacing: 12) {
                    Image(systemName: "person")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    TextField("e.g. An Nguyen", text: $viewModel.fullName)
                        .font(.system(size: 15))
                }
            }
            
            // Email
            inputSection(title: "Email") {
                HStack(spacing: 12) {
                    Image(systemName: "envelope")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    TextField("name@example.com", text: $viewModel.email)
                        .font(.system(size: 15))
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                }
            }
            
            // Phone Number
            inputSection(title: "Phone Number") {
                HStack(spacing: 8) {
                    Image(systemName: "iphone")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    HStack(spacing: 4) {
                        Text(" +84")
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .foregroundColor(AppColors.textPrimary)
                        
                        Divider()
                            .frame(height: 18)
                            .background(AppColors.border)
                    }
                    .padding(.trailing, 4)
                    
                    TextField("012 345 6789", text: $viewModel.phoneNumber)
                        .font(.system(size: 15))
                        .keyboardType(.phonePad)
                }
            }
            
            // Password
            inputSection(title: "Password") {
                HStack(spacing: 12) {
                    Image(systemName: "lock")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    if isPasswordVisible {
                        TextField("At least 8 characters", text: $viewModel.password)
                            .font(.system(size: 15))
                            .textContentType(.none)
                    } else {
                        SecureField("At least 8 characters", text: $viewModel.password)
                            .font(.system(size: 15))
                    }
                    
                    Button(action: {
                        isPasswordVisible.toggle()
                    }) {
                        Image(systemName: isPasswordVisible ? "eye" : "eye.slash")
                            .font(.system(size: 15))
                            .foregroundStyle(AppColors.textTertiary)
                    }
                }
            }
            
            // Confirm Password
            inputSection(title: "Confirm Password") {
                HStack(spacing: 12) {
                    Image(systemName: "ellipsis.rectangle")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)
                    
                    if isConfirmPasswordVisible {
                        TextField("Re-enter password", text: $confirmPassword)
                            .font(.system(size: 15))
                            .autocapitalization(.none)
                    } else {
                        SecureField("Re-enter password", text: $confirmPassword)
                            .font(.system(size: 15))
                    }
                    
                    Button(action: { isConfirmPasswordVisible.toggle() }) {
                        Image(systemName: isConfirmPasswordVisible ? "eye" : "eye.slash")
                            .font(.system(size: 15))
                            .foregroundStyle(AppColors.textTertiary)
                    }
                }
            }
        }
    }
    
    private func inputSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
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
    
    private var termsCheckboxView: some View {
        HStack(alignment: .top, spacing: 10) {
            Button(action: { isAgreeToTerms.toggle()}) {
                Image(systemName: isAgreeToTerms ? "checkmark.square.fill" : "square")
                    .font(.system(size: 20))
                    .foregroundColor(isAgreeToTerms ? AppColors.primary: AppColors.textTertiary)
            }
            
            Text("I agree to the ")
                .font(.system(size: 13))
                .foregroundColor(AppColors.textSecondary)
            +
            Text("Community Donation Guidelines")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppColors.primary)
                .underline()
            +
            Text(" & Terms ")
                .font(.system(size: 13))
                .foregroundColor(AppColors.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }
    
    private var createAccountButton: some View {
        Button(action: handleCreateAccount) {
            HStack(spacing: 8) {
                if viewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Create Account")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        
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
            Text("Already have an account?")
                .font(.system(size: 14))
                .foregroundColor(AppColors.textSecondary)
            
            Button("Log In") {
                if let onNavigateToLogin = onNavigateToLogin {
                    onNavigateToLogin()
                } else {
                    dismiss()
                }
            }
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(AppColors.primary)
        }
    }
    
    //
    private var trustBadgeView: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 13))
                .foregroundColor(AppColors.primary)
            
            Text("Safe & verified neighborhood exchange across Vietnam")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(AppColors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(AppColors.primarySoft.opacity(0.6))
        .cornerRadius(12)
    }
    
    // MARK:
    
    private var isFormValid: Bool {
        !viewModel.fullName.trimmingCharacters(in: .whitespaces).isEmpty &&
        !viewModel.email.trimmingCharacters(in: .whitespaces).isEmpty &&
        !viewModel.phoneNumber.trimmingCharacters(in: .whitespaces).isEmpty &&
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
            viewModel.errorMessage = "Vui lòng đồng ý với Điều khoản cộng đồng"
            return
        }
        viewModel.register(appState: appState)
    }
}

#Preview {
    RegisterView()
        .environmentObject(AppState())
}
