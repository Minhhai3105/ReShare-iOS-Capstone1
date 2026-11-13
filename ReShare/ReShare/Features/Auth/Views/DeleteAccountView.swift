import SwiftUI

/// Màn xác nhận xoá tài khoản: nói rõ cái gì bị xoá, cái gì được giữ ẩn danh, bắt nhập lại mật khẩu
/// và tích "không thể hoàn tác" trước khi gọi backend.
struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    var onDeleted: () -> Void

    @State private var password = ""
    @State private var understood = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @FocusState private var passwordFocused: Bool

    private let danger = Color(red: 0.78, green: 0.16, blue: 0.16)
    private let textDark = Color(red: 0.11, green: 0.15, blue: 0.13)
    private let textMuted = Color(red: 0.40, green: 0.46, blue: 0.42)

    private var canDelete: Bool { !password.isEmpty && understood && !isDeleting }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Thao tác này **không thể hoàn tác**. Sau khi xoá, bạn không đăng nhập lại được bằng tài khoản này.")
                        .font(.system(size: 15))
                        .foregroundColor(textDark)

                    infoCard(title: "Sẽ bị xoá", icon: "trash.fill", color: danger, lines: [
                        "Tài khoản đăng nhập",
                        "Họ tên, email và số điện thoại trong hồ sơ",
                        "Các bài Kho đồ 0đ đang mở, kèm ảnh và địa chỉ nhận đồ",
                    ])
                    infoCard(title: "Được giữ ở dạng ẩn danh", icon: "eye.slash.fill", color: textMuted, lines: [
                        "Đơn quyên góp đã gửi, vì phiếu nhập kho và phân phối tham chiếu tới chúng",
                        "Tin nhắn đã gửi cho người khác, tên hiển thị đổi thành “Người dùng đã xoá”",
                    ])

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nhập mật khẩu để xác nhận")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(textDark)
                        SecureField("Mật khẩu", text: $password)
                            .textContentType(.password)
                            .focused($passwordFocused)
                            .padding(14)
                            .background(Color.white)
                            .cornerRadius(12)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.black.opacity(0.1), lineWidth: 1))
                    }

                    Toggle(isOn: $understood) {
                        Text("Tôi hiểu tài khoản sẽ bị xoá vĩnh viễn")
                            .font(.system(size: 14))
                            .foregroundColor(textDark)
                    }
                    .tint(danger)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(danger)
                    }

                    Button(role: .destructive, action: deleteAccount) {
                        HStack(spacing: 8) {
                            if isDeleting { ProgressView().tint(.white) }
                            Text(isDeleting ? "Đang xoá tài khoản…" : "Xoá vĩnh viễn tài khoản")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(canDelete ? danger : danger.opacity(0.35))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                    }
                    .disabled(!canDelete)

                    if isDeleting {
                        Text("Máy chủ có thể mất tới 1 phút để khởi động. Vui lòng không tắt ứng dụng.")
                            .font(.system(size: 12))
                            .foregroundColor(textMuted)
                    }

                }
                .padding(20)
            }
            .background(Color(red: 0.98, green: 0.98, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Xoá tài khoản")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { dismiss() }
                        .disabled(isDeleting)
                }
            }
            .interactiveDismissDisabled(isDeleting)
        }
    }

    private func infoCard(title: String, icon: String, color: Color, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(color)
            ForEach(lines, id: \.self) { line in
                HStack(alignment: .top, spacing: 8) {
                    Text("•").foregroundColor(textMuted)
                    Text(line).font(.system(size: 14)).foregroundColor(textDark)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.black.opacity(0.06), lineWidth: 1))
    }

    private func deleteAccount() {
        guard canDelete else { return }
        passwordFocused = false
        errorMessage = nil
        isDeleting = true
        Task {
            do {
                try await AccountDeletionService.deleteAccount(password: password)
                isDeleting = false
                dismiss()
                onDeleted()
            } catch {
                isDeleting = false
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    DeleteAccountView(onDeleted: {})
}
