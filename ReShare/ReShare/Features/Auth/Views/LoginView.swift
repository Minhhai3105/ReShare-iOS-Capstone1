//
//  LoginView.swift
//  ReShare
//
//  Created by Cao Hai on 18/9/26.
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AuthViewModel()

    // State ẩn/hiện mật khẩu
    @State private var isPasswordVisible: Bool = false

    // Điều hướng sang màn hình Đăng ký (RegisterView)
    @State private var navigateToRegister: Bool = false

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

                        // Nút Đăng nhập chính (Log In)
                        loginButton
                            .padding(.top, 4)

                        // Vạch phân cách: OR CONTINUE WITH
                        orDividerView
                            .padding(.vertical, 4)

                        // Nút Đăng nhập với Apple
                        appleSignInButton

                        // Link chuyển sang trang Đăng ký (Sign Up)
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
            // Điều hướng sang RegisterView khi bấm "Sign Up"
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
                Text("Welcome back")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(AppColors.textPrimary)

                Text("Sign in to continue using ReShare.")
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

                    TextField("Email address", text: $viewModel.email)
                        .font(.system(size: 15))
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }

            // Password Input
            inputSection(title: "Password") {
                HStack(spacing: 12) {
                    Image(systemName: "lock")
                        .font(.system(size: 17))
                        .foregroundStyle(AppColors.textTertiary)
                        .frame(width: 20)

                    if isPasswordVisible {
                        TextField("Password", text: $viewModel.password)
                            .font(.system(size: 15))
                            .textContentType(.none)
                    } else {
                        SecureField("Password", text: $viewModel.password)
                            .font(.system(size: 15))
                    }

                    Button(action: { isPasswordVisible.toggle() }) {
                        Image(systemName: isPasswordVisible ? "eye" : "eye.slash")
                            .font(.system(size: 15))
                            .foregroundStyle(AppColors.textTertiary)
                    }
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
            Button(action: {
                // Action quên mật khẩu (sẽ tích hợp gửi mail reset)
            }) {
                Text("Forgot password?")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppColors.primary)
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
                    Text("Log In")
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
        .disabled(!isFormValid || viewModel.isLoading)
    }

    // MARK: - 6. Or Divider
    private var orDividerView: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(AppColors.border.opacity(0.6))
                .frame(height: 1)

            Text("OR CONTINUE WITH")
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

    // MARK: - 7. Apple Sign In Button
    private var appleSignInButton: some View {
        Button(action: {
            // Sẽ gắn Sign in with Apple ở Sprint tiếp theo
        }) {
            HStack(spacing: 8) {
                Image(systemName: "apple.logo")
                    .font(.system(size: 17, weight: .medium))

                Text("Sign in with Apple")
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
    }

    // MARK: - 8. Sign Up Link
    private var signUpLinkView: some View {
        HStack(spacing: 5) {
            Text("Don't have an account?")
                .font(.system(size: 14))
                .foregroundColor(AppColors.textSecondary)

            Button("Sign Up") {
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

            Text("Safe & verified neighborhood exchange")
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
