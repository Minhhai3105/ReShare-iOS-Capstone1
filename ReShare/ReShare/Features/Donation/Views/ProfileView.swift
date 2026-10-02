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
                                    .font(.system(size: 60))
                                    .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))

                            }

                            VStack(alignment: .leading, spacing: 3) {
                                Text(activeUserName)
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))

                                Text(activeUserEmail)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))

                                HStack(spacing: 6) {
                                    BadgeTag(icon: "person.crop.circle", text: "Tài khoản ReShare", color: .green)
                                }
                                .padding(.top, 2)
                            }

                            Spacer()
                        }

                        Text("Hồ sơ đang ở chế độ thử nghiệm; hạng thành viên chưa được triển khai.")
                            .font(.system(size: 11))
                            .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                            .frame(maxWidth: .infinity, alignment: .leading)
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

                    // MARK: 2. KHỐI TÁC ĐỘNG CỘNG ĐỒNG (MY COMMUNITY IMPACT)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("THÔNG TIN QUYÊN GÓP THỬ NGHIỆM")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("Demo")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                        }
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
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                                        Text("Mở lịch sử để xem dữ liệu của bạn")
                                            .font(.system(size: 11))
                                            .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                                    }

                                    Spacer()

                                    Text("Lịch sử")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))

                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color(uiColor: .tertiaryLabel))
                                }
                                .padding(.vertical, 12)
                            }

                            Divider().padding(.leading, 52)

                            // DÒNG 2: MÁI ẤM & NGƯỜI NHẬN ĐÃ ĐƯỢC GIÚP ĐỠ
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.mint.opacity(0.15))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "person.2.fill")
                                        .foregroundColor(Color.mint)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Người được hỗ trợ")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                                    Text("Chưa theo dõi số liệu này")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                                }

                                Spacer()

                                Text("—")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                            }
                            .padding(.vertical, 12)

                            Divider().padding(.leading, 52)

                            // DÒNG 3: BẢO VỆ MÔI TRƯỜNG / CO2 SAVED
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.green.opacity(0.15))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "leaf.fill")
                                        .foregroundColor(Color.green)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Tác động môi trường")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                                    Text("Chưa đo lường CO₂ hoặc khối lượng")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                                }

                                Spacer()

                                Text("—")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                            }
                            .padding(.vertical, 12)
                        }
                        .padding(.horizontal, 14)
                        .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.black.opacity(0.08), lineWidth: 1)
                        )
                        .padding(.horizontal, 20)
                    }

                    // MARK: 3. CÀI ĐẶT & TIỆN ÍCH QUYÊN GÓP (PREFERENCES)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("TÍNH NĂNG ĐANG PHÁT TRIỂN")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.32, green: 0.40, blue: 0.36))
                            .padding(.horizontal, 20)

                        VStack(spacing: 0) {
                            MenuActionRow(icon: "mappin.circle.fill", title: "Trạm yêu thích", valueText: "Chưa có trạm")
                            Divider().padding(.leading, 50)
                            MenuActionRow(icon: "book.closed.fill", title: "Hướng dẫn quyên góp", valueText: "Chưa triển khai")
                            Divider().padding(.leading, 50)
                            MenuActionRow(icon: "bell.fill", title: "Thông báo trạng thái", valueText: "Chưa triển khai")
                            Divider().padding(.leading, 50)
                            MenuActionRow(icon: "questionmark.circle.fill", title: "Trợ giúp", valueText: "Chưa triển khai")
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
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .padding(.horizontal, 20)

                    Button(action: { showSignOutAlert = true }) {
                        HStack(spacing: 8) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 14, weight: .bold))
                            Text("Sign Out")
                                .font(.system(size: 15, weight: .bold))
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

                    // Footer
                    Text("ReShare Non-Profit Network • Made with care in Vietnam")
                        .font(.system(size: 11))
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
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.white))
                                .shadow(color: Color.black.opacity(0.06), radius: 4)
                        }
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
            // Alert Đăng xuất
            .alert("Sign Out", isPresented: $showSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    try? appState.logout()
                }
            } message: {
                Text("Are you sure you want to sign out?")
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
            Image(systemName: icon).font(.system(size: 9))
            Text(text).font(.system(size: 10, weight: .semibold))
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
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                .frame(width: 24)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))

            Spacer()

            if let val = valueText {
                Text(val)
                    .font(.system(size: 12))
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
