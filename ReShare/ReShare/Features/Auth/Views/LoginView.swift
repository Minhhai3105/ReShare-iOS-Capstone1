//
//  LoginView.swift
//  ReShare
//
//  Created by Cao Hai on 18/9/26.
//

import SwiftUI
import GoogleSignInSwift

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AuthViewModel()

    // State ẩn/hiện mật khẩu
    @State private var isPasswordVisible: Bool = false

    // Điều hướng sang màn hình Đăng ký (RegisterView)
    @State private var navigateToRegister: Bool = false

    // Màn Quên mật khẩu (gửi thư đặt lại qua Firebase Auth)
    @State private var showForgotPassword: Bool = false

    var body: some View {
        NavigationStack {
            ZStack {
                // 1. Nền toàn màn hình
                AppColors.background.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        // Viên thuốc ReShare VN trên cùng
                        topBarPillView
                            .padding(.top, 8)

                        // Logo chiếc lá & Tiêu đề chào mừng
                        headerView
                            .padding(.top, 6)

                        // Các ô nhập liệu Email & Password
                        formFieldsView
                            .padding(.top, 4)

                        // Nút Quên mật khẩu căn phải
                        forgotPasswordView

                        // Hiển thị lỗi từ Firebase nếu có
                        if let error = viewModel.errorMessage ?? appState.sessionError {
                            Text(error)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(AppColors.rejected)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                                .accessibilityIdentifier("loginError")
                        }

                        // Nút Đăng nhập chính
                        loginButton
                            .padding(.top, 4)

                        // Đăng nhập Google: chỉ hiện khi bản build có CLIENT_ID + URL scheme, để không có nút chết.
                        // Không có Sign in with Apple: nhóm chưa có tài khoản Apple Developer trả phí. Đây là lệch
                        // chuẩn Guideline 4.8 có chủ đích, vì đồ án không phát hành lên App Store.
                        if viewModel.isGoogleSignInAvailable {
                            orDividerView
                                .padding(.vertical, 4)

                            googleSignInButton

                            googleConsentText
                        }

                        // Link chuyển sang trang Đăng ký
                        signUpLinkView
                            .padding(.top, 8)

                        // Huy hiệu tin cậy ở đáy
                        trustBadgeView
                            .padding(.top, 6)
                            .padding(.bottom, 24)
                    }
                    .padding(.horizontal, 20)
                }
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordView(email: viewModel.email.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            // Điều hướng sang RegisterView khi bấm "Đăng ký"
            .navigationDestination(isPresented: $navigateToRegister) {
                RegisterView(onNavigateToLogin: {
                    navigateToRegister = false
                })
            }
            .navigationBarHidden(true)
        }
    }

    // MARK: - 1. Top Bar Pill
    private var topBarPillView: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.3.trianglepath")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AppColors.primary)

            Text("ReShare VN")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppColors.primary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(AppColors.primarySoft)
        .clipShape(Capsule())
    }

    // MARK: - 2. Logo & Header
    private var headerView: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Icon hộp vuông bo góc chứa lá trắng
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(AppColors.primary)
                    .frame(width: 54, height: 54)

                Image(systemName: "leaf.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Chào mừng trở lại")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(AppColors.textPrimary)

                Text("Đăng nhập để tiếp tục dùng ReShare.")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(AppColors.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 3. Input Form Fields
    private var formFieldsView: some View {
        VStack(spacing: 16) {
            // Email Input
            inputSection(title: "Email") {
                HStack(spacing: 12) {
                    Image(systemName: "envelope")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)

                    TextField("Địa chỉ email", text: $viewModel.email)
                        .font(.system(size: 15))
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }

            // Password Input
            inputSection(title: "Mật khẩu") {
                HStack(spacing: 12) {
                    Image(systemName: "lock")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)

                    if isPasswordVisible {
                        TextField("Mật khẩu", text: $viewModel.password)
                            .font(.system(size: 15))
                            .textContentType(.none)
                    } else {
                        SecureField("Mật khẩu", text: $viewModel.password)
                            .font(.system(size: 15))
                    }

                    Button(action: { isPasswordVisible.toggle() }) {
                        Image(systemName: isPasswordVisible ? "eye" : "eye.slash")
                            .font(.system(size: 15))
                            .foregroundStyle(AppColors.textTertiary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(isPasswordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu")
                }
            }
        }
    }

    // Khung bọc ô input dùng chung
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

    // MARK: - 4. Forgot Password
    private var forgotPasswordView: some View {
        HStack {
            Spacer()
            Button(action: { showForgotPassword = true }) {
                Text("Quên mật khẩu?")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppColors.primary)
                    .frame(minHeight: 44)
            }
        }
    }

    // MARK: - 5. Main Login Button
    private var loginButton: some View {
        Button(action: {
            viewModel.login(appState: appState)
        }) {
            HStack(spacing: 8) {
                if viewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Đăng nhập")
                        .font(.system(size: 16, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(isFormValid ? AppColors.primary : AppColors.border)
            .foregroundColor(.white)
            .cornerRadius(16)
            .shadow(color: isFormValid ? AppColors.primary.opacity(0.3) : Color.clear, radius: 10, x: 0, y: 4)
        }
        .disabled(!isFormValid || viewModel.isLoading || viewModel.isGoogleLoading)
    }

    // MARK: - 6. Vạch phân cách
    private var orDividerView: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(AppColors.border.opacity(0.6))
                .frame(height: 1)

            Text("HOẶC")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(AppColors.textTertiary)
                .lineLimit(1)
                .fixedSize()

            Rectangle()
                .fill(AppColors.border.opacity(0.6))
                .frame(height: 1)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - 7. Google Sign In Button
    // Nút theo kiểu nút của app (trắng, bo 16, cao 52) nhưng giữ đúng quy định thương hiệu Google: logo "G"
    // chuẩn lấy nguyên từ SDK GoogleSignIn (không vẽ lại, không đổi màu) và câu chữ được Google chấp nhận
    // ("Tiếp tục với Google"). Không tải được logo thì dùng nút chính thức của SDK. Lần đầu đăng nhập sẽ tự tạo tài khoản.
    private var googleSignInButton: some View {
        Group {
            if let logo = Self.googleLogo {
                Button(action: { viewModel.loginWithGoogle(appState: appState) }) {
                    HStack(spacing: 10) {
                        if viewModel.isGoogleLoading {
                            ProgressView()
                                .frame(width: 20, height: 20)
                        } else {
                            Image(uiImage: logo)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                        }
                        Text(viewModel.isGoogleLoading ? "Đang mở Google…" : "Tiếp tục với Google")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(AppColors.textPrimary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.white)
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(AppColors.border.opacity(0.8), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.02), radius: 6, x: 0, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isGoogleLoading || viewModel.isLoading)
                .opacity(viewModel.isLoading ? 0.6 : 1)
                .accessibilityLabel("Tiếp tục với Google")
            } else {
                GoogleSignInButton(
                    scheme: .light,
                    style: .wide,
                    state: viewModel.isGoogleLoading || viewModel.isLoading ? .disabled : .normal
                ) {
                    viewModel.loginWithGoogle(appState: appState)
                }
                .disabled(viewModel.isGoogleLoading || viewModel.isLoading)
            }
        }
        .accessibilityIdentifier("googleSignInButton")
        .frame(maxWidth: .infinity)
    }

    /// Logo "G" chuẩn đi kèm SDK GoogleSignIn (resource bundle `GoogleSignIn_GoogleSignIn.bundle`).
    private static let googleLogo: UIImage? = {
        guard let url = Bundle.main.url(forResource: "GoogleSignIn_GoogleSignIn", withExtension: "bundle"),
              let bundle = Bundle(url: url) else { return nil }
        return UIImage(named: "google", in: bundle, compatibleWith: nil)
    }()

    // Đăng nhập Google lần đầu là tạo tài khoản mà không qua màn Đăng ký, nên nói rõ việc đồng ý
    // Điều khoản & Chính sách ngay dưới nút (giống ô đồng ý ở màn Đăng ký, App Store 1.2 và 5.1.1).
    private var googleConsentText: some View {
        Text(googleConsentMarkdown)
            .font(.system(size: 12))
            .foregroundColor(AppColors.textSecondary)
            .tint(AppColors.primary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    private var googleConsentMarkdown: AttributedString {
        let markdown = "Tiếp tục với Google là bạn đồng ý với "
            + "[Điều khoản sử dụng](\(Constants.Links.termsOfUse.absoluteString)) và "
            + "[Chính sách quyền riêng tư](\(Constants.Links.privacyPolicy.absoluteString)) của ReShare."
        return (try? AttributedString(markdown: markdown)) ?? AttributedString(markdown)
    }

    // MARK: - 8. Sign Up Link
    private var signUpLinkView: some View {
        HStack(spacing: 5) {
            Text("Chưa có tài khoản?")
                .font(.system(size: 14))
                .foregroundColor(AppColors.textSecondary)

            Button("Đăng ký") {
                navigateToRegister = true
            }
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(AppColors.primary)
        }
    }

    // MARK: - 9. Trust Badge
    private var trustBadgeView: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 13))
                .foregroundColor(AppColors.textTertiary)

            Text("Trao đổi đồ an toàn trong cộng đồng")
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(AppColors.textTertiary)
        }
    }

    // MARK: - Logic Validation
    private var isFormValid: Bool {
        !viewModel.email.trimmingCharacters(in: .whitespaces).isEmpty &&
        viewModel.password.count >= 6
    }
}

#Preview {
    LoginView()
        .environmentObject(AppState())
}
