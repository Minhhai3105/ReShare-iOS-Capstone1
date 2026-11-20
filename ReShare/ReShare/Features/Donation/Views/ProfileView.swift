import SwiftUI

/// Màn hình Hồ sơ cá nhân đa chức năng: Quản lý tài khoản, Tác động môi trường & Lịch sử quyên góp
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    // Callback khi bấm nút Back (nếu có tùy biến)
    var onBack: (() -> Void)? = nil
    var isRootTab: Bool = false

    // Dữ liệu người dùng
    var userName: String = "Thành viên ReShare"
    var phoneNumber: String = "Chưa cập nhật"
    var userEmail: String = "Chưa có email"

    private var activeUserName: String {
        if let name = appState.currentUserProfile?.displayName, !name.isEmpty {
            return name
        }
        if let authName = AuthService.shared.currentDisplayName, !authName.isEmpty {
            return authName
        }
        return userName
    }

    private var activeUserEmail: String {
        if let email = appState.currentUserProfile?.email, !email.isEmpty {
            return email
        }
        if let authEmail = AuthService.shared.currentEmail, !authEmail.isEmpty {
            return authEmail
        }
        return userEmail
    }

    private var activePhoneNumber: String {
        if let phone = appState.currentUserProfile?.phoneNumber, !phone.isEmpty {
            return phone
        }
        return phoneNumber
    }

    // State điều hướng
    @State private var showHistoryScreen: Bool = false
    @State private var showProfileEditor: Bool = false
    @State private var showSignOutAlert: Bool = false
    @State private var showDeleteAccount: Bool = false
    @State private var showChangePassword: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    // MARK: 1. USER HERO CARD (AVATAR & TIER)
                    VStack(spacing: 14) {
                        HStack(spacing: 14) {
                            // Avatar tài khoản, không gắn trạng thái xác minh khi chưa có dữ liệu
                            ZStack {
                                Circle()
                                    .fill(Color(red: 0.15, green: 0.35, blue: 0.20).opacity(0.15))
                                    .frame(width: 60, height: 60)

                                Image(systemName: "person.crop.circle.fill")
                                    .scaledFont(size: 60)
                                    .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))

                            }

                            VStack(alignment: .leading, spacing: 3) {
                                Text(activeUserName)
                                    .scaledFont(size: 18, weight: .bold)
                                    .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))

                                Text(activeUserEmail)
                                    .scaledFont(size: 12)
                                    .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))

                                HStack(spacing: 6) {
                                    BadgeTag(icon: "person.crop.circle", text: "Tài khoản ReShare", color: .green)
                                }
                                .padding(.top, 2)
                            }

                            Spacer()
                        }

                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.white)
                            .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color.black.opacity(0.08), lineWidth: 1)
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 4)

                    // MARK: 2. QUYÊN GÓP CỦA BẠN (chỉ giữ mục đang chạy thật: lịch sử đơn)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("QUYÊN GÓP CỦA BẠN")
                            .scaledFont(size: 11, weight: .bold)
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 20)

                        VStack(spacing: 0) {
                            // DÒNG 1: MY DONATIONS -> BẤM VÀO MỞ MÀN HÌNH LỊCH SỬ!
                            Button(action: { showHistoryScreen = true }) {
                                HStack(spacing: 12) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(Color(red: 0.15, green: 0.35, blue: 0.20).opacity(0.12))
                                            .frame(width: 40, height: 40)
                                        Image(systemName: "shippingbox.fill")
                                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                                    }

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Đơn đã lưu")
                                            .scaledFont(size: 14, weight: .bold)
                                            .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                                        Text("Mở lịch sử để xem dữ liệu của bạn")
                                            .scaledFont(size: 11)
                                            .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                                    }

                                    Spacer()

                                    Text("Lịch sử")
                                        .scaledFont(size: 14, weight: .bold)
                                        .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))

                                    Image(systemName: "chevron.right")
                                        .scaledFont(size: 13, weight: .semibold)
                                        .foregroundColor(Color(uiColor: .tertiaryLabel))
                                }
                                .padding(.vertical, 12)
                            }

                        }
                        .padding(.horizontal, 14)
                        .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.black.opacity(0.08), lineWidth: 1)
                        )
                        .padding(.horizontal, 20)
                    }

                    // MARK: 2b. AN TOÀN (App Store Guideline 1.2): bỏ chặn được cả người chưa từng nhắn tin
                    VStack(alignment: .leading, spacing: 10) {
                        Text("AN TOÀN")
                            .scaledFont(size: 11, weight: .bold)
                            .foregroundColor(Color(red: 0.32, green: 0.40, blue: 0.36))
                            .padding(.horizontal, 20)

                        NavigationLink(destination: BlockedUsersView()) {
                            HStack {
                                MenuActionRow(icon: "hand.raised.fill", title: "Người dùng đã chặn")
                                Image(systemName: "chevron.right")
                                    .scaledFont(size: 13, weight: .semibold)
                                    .foregroundColor(Color(uiColor: .tertiaryLabel))
                            }
                        }
                        .padding(.horizontal, 14)
                        .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.black.opacity(0.08), lineWidth: 1)
                        )
                        .padding(.horizontal, 20)

                        if AuthService.shared.canChangePassword {
                            Button { showChangePassword = true } label: {
                                HStack {
                                    MenuActionRow(icon: "key.fill", title: "Đổi mật khẩu")
                                    Image(systemName: "chevron.right")
                                        .scaledFont(size: 13, weight: .semibold)
                                        .foregroundColor(Color(uiColor: .tertiaryLabel))
                                }
                                .padding(.horizontal, 14)
                                .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 18)
                                        .stroke(Color.black.opacity(0.08), lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 20)
                        }
                    }

                    // MARK: 3b. QUYỀN RIÊNG TƯ & HỖ TRỢ (App Store 1.5, 5.1.1(i))
                    VStack(alignment: .leading, spacing: 10) {
                        Text("QUYỀN RIÊNG TƯ & HỖ TRỢ")
                            .scaledFont(size: 11, weight: .bold)
                            .foregroundColor(Color(red: 0.32, green: 0.40, blue: 0.36))
                            .padding(.horizontal, 20)

                        VStack(spacing: 0) {
                            Link(destination: Constants.Links.privacyPolicy) {
                                MenuActionRow(icon: "hand.raised.fill", title: "Chính sách quyền riêng tư", valueText: "Mở trên web")
                            }
                            Divider().padding(.leading, 50)
                            Link(destination: Constants.Links.termsOfUse) {
                                MenuActionRow(icon: "doc.text.fill", title: "Điều khoản sử dụng", valueText: "Mở trên web")
                            }
                            Divider().padding(.leading, 50)
                            Link(destination: Constants.Links.supportMail) {
                                MenuActionRow(icon: "envelope.fill", title: "Liên hệ hỗ trợ", valueText: Constants.Links.supportEmail)
                            }
                        }
                        .padding(.horizontal, 14)
                        .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.black.opacity(0.08), lineWidth: 1)
                        )
                        .padding(.horizontal, 20)
                    }

                    // MARK: 4. NÚT ĐĂNG XUẤT (SIGN OUT)
                    Button(action: { showProfileEditor = true }) {
                        Label("Chỉnh sửa hồ sơ", systemImage: "person.crop.circle.badge.pencil")
                            .scaledFont(size: 15, weight: .semibold)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .padding(.horizontal, 20)

                    Button(action: { showSignOutAlert = true }) {
                        HStack(spacing: 8) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .scaledFont(size: 14, weight: .bold)
                            Text("Đăng xuất")
                                .scaledFont(size: 15, weight: .bold)
                        }
                        .foregroundColor(Color.red)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.red.opacity(0.15), lineWidth: 1)
                        )
                    }
                    .buttonStyle(ScaleButtonStyle())
                    .padding(.horizontal, 20)
                    .padding(.top, 4)

                    // Xoá tài khoản ngay trong app (App Store Guideline 5.1.1(v))
                    Button(action: { showDeleteAccount = true }) {
                        Text("Xoá tài khoản")
                            .scaledFont(size: 14, weight: .semibold)
                            .foregroundColor(Color.red.opacity(0.85))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .padding(.horizontal, 20)

                    // Footer
                    Text("ReShare Non-Profit Network • Made with care in Vietnam")
                        .scaledFont(size: 11)
                        .foregroundColor(.secondary)
                        .padding(.bottom, 24)
                }
            }
            .background(Color(red: 0.98, green: 0.98, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Tài khoản cá nhân")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .preferredColorScheme(.light)
            .environment(\.colorScheme, .light)
            .toolbar {
                if !isRootTab {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(action: {
                            if let onBack = onBack {
                                onBack()
                            } else {
                                dismiss()
                            }
                        }) {
                            Image(systemName: "chevron.left")
                                .scaledFont(size: 15, weight: .bold)
                                .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.white))
                                .shadow(color: Color.black.opacity(0.06), radius: 4)
                        }
                        .accessibilityLabel("Quay lại")
                    }
                }
            }
            // Sheet mở màn hình Lịch sử quyên góp (Ảnh 1)
            .sheet(isPresented: $showHistoryScreen) {
                DonationHistoryView()
            }
            .sheet(isPresented: $showProfileEditor) {
                UserProfileView()
            }
            .sheet(isPresented: $showChangePassword) {
                ChangePasswordView()
            }
            .sheet(isPresented: $showDeleteAccount) {
                DeleteAccountView(onDeleted: {
                    // Tài khoản đã bị xoá trên máy chủ: dọn phiên cục bộ để quay về màn đăng nhập.
                    try? appState.logout()
                })
            }
            // Alert Đăng xuất
            .alert("Đăng xuất", isPresented: $showSignOutAlert) {
                Button("Huỷ", role: .cancel) {}
                Button("Đăng xuất", role: .destructive) {
                    try? appState.logout()
                }
            } message: {
                Text("Bạn có chắc muốn đăng xuất khỏi ReShare?")
            }
        }
    }
}

// MARK: - Components con
struct BadgeTag: View {
    let icon: String
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: icon).scaledFont(size: 9)
            Text(text).scaledFont(size: 10, weight: .semibold)
        }
        .foregroundColor(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Capsule().fill(color.opacity(0.10)))
    }
}

struct MenuActionRow: View {
    let icon: String
    let title: String
    var valueText: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .scaledFont(size: 16)
                .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                .frame(width: 24)

            Text(title)
                .scaledFont(size: 14, weight: .medium)
                .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))

            Spacer()

            if let val = valueText {
                Text(val)
                    .scaledFont(size: 12)
                    .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
            }

        }
        .padding(.vertical, 13)
    }
}

#Preview {
    ProfileView()
        .environmentObject(AppState())
}
