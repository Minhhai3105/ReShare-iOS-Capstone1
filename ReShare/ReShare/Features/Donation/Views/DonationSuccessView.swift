import SwiftUI

/// Màn hình BƯỚC 3: Thông báo Quyên góp Thành công & Hóa đơn biên nhận (UI 1 Nâng cấp)
struct DonationSuccessView: View {
    @Environment(\.dismiss) private var dismiss

    // Món đồ vừa được tạo thành công
    var item: DonationItem? = nil
    var confirmationCode: String = ""

    // Callback quay về màn hình Trang chủ (Home)
    var onBackToHome: () -> Void = {}

    @State private var hasCopied: Bool = false
    @State private var showHistorySheet: Bool = false

    var body: some View {
        VStack(spacing: 20) {
            // MARK: 1. TOP BAR
            HStack {
                Spacer()

                // Badge "DONATION SUBMITTED"
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 6, height: 6)

                    Text("ĐƠN THỬ NGHIỆM ĐÃ LƯU")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(Color.green.opacity(0.12)))

                Spacer()

                // Nút Đóng (X) góc phải
                Button(action: onBackToHome) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white))
                        .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer()

            // MARK: 2. HÌNH MINH HỌA HỘP QUÀ SINH THÁI (GIFT BOX)
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 28)
                    .fill(Color(red: 0.94, green: 0.96, blue: 0.92))
                    .frame(width: 140, height: 140)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(Color.green.opacity(0.15), lineWidth: 1.5)
                    )

                // Icon hộp quà mầm cây 🌱
                VStack(spacing: 4) {
                    Image(systemName: "gift.fill")
                        .font(.system(size: 54))
                        .foregroundColor(Color(red: 0.20, green: 0.38, blue: 0.24))
                }
                .frame(width: 140, height: 140)

                // Huy hiệu tích xanh góc dưới
                ZStack {
                    Circle()
                        .fill(Color(red: 0.15, green: 0.35, blue: 0.20))
                        .frame(width: 32, height: 32)

                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                }
                .offset(x: 6, y: 6)
            }

            // MARK: 3. LỜI CẢM ƠN
            VStack(spacing: 6) {
                Text("Đã lưu đơn thử nghiệm")
                    .font(.system(size: 26, weight: .bold, design: .serif))
                    .foregroundColor(Color(red: 0.11, green: 0.27, blue: 0.16))

                Text("Thông tin đã lưu trên Firebase. Hiện chưa có trạm hoặc tình nguyện viên tiếp nhận đồ thật.")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            // MARK: 4. BIÊN NHẬN QUYÊN GÓP (DONATION RECEIPT)
            VStack(spacing: 12) {
                // Header của Receipt + Badge "Under Review"
                HStack {
                    Text("THÔNG TIN ĐƠN DEMO")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(red: 0.32, green: 0.40, blue: 0.36))

                    Spacer()

                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(red: 0.88, green: 0.55, blue: 0.22))
                            .frame(width: 6, height: 6)
                        Text("Demo")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.88, green: 0.55, blue: 0.22))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color(red: 0.88, green: 0.55, blue: 0.22).opacity(0.12)))
                }

                Divider()

                // Các hàng thông tin
                ReceiptRow(title: "Món đồ", value: item?.title ?? "Chưa có thông tin")
                ReceiptRow(title: "Danh mục", value: item?.category.title ?? "Chưa có thông tin")
                ReceiptRow(title: "Hình thức", value: (item?.deliveryMethod == "pickup" ? "Mô phỏng lấy tận nơi" : "Mô phỏng gửi tại điểm"))

                // Hàng Mã đơn có nút Copy
                HStack {
                    Text("Mã đơn")
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))

                    Spacer()

                    Button(action: copyToClipboard) {
                        HStack(spacing: 4) {
                            Text(confirmationCode)
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))

                            Image(systemName: hasCopied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11))
                                .foregroundColor(hasCopied ? .green : Color(red: 0.40, green: 0.46, blue: 0.42))
                        }
                    }
                }

                Divider()

                // Dòng thời gian ước tính duyệt
                HStack(spacing: 6) {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Color(red: 0.88, green: 0.55, blue: 0.22))

                    Text("Chưa có lịch duyệt hoặc tiếp nhận đồ thật.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))

                    Spacer()
                }
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.white)
                    .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            )
            .padding(.horizontal, 20)

            Spacer()

            // MARK: 5. NÚT ĐIỀU HƯỚNG VỀ HOME
            VStack(spacing: 12) {
                Button(action: onBackToHome) {
                    HStack(spacing: 8) {
                        Text("Quay lại")
                            .font(.system(size: 16, weight: .bold))

                        Image(systemName: "arrow.right")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color(red: 0.86, green: 0.58, blue: 0.30)) // Màu cam đất chuẩn Figma
                    )
                }
                .buttonStyle(ScaleButtonStyle())

                Button(action: { showHistorySheet = true }) {
                    Text("Xem lịch sử đơn")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                        .underline()
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .preferredColorScheme(.light)
        .environment(\.colorScheme, .light)
        .sheet(isPresented: $showHistorySheet) {
            DonationHistoryView()
        }
    }

    private func copyToClipboard() {
        UIPasteboard.general.string = confirmationCode
        hasCopied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            hasCopied = false
        }
    }
}

// Component hàng của hóa đơn
struct ReceiptRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 12))
                .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
        }
    }
}

#Preview {
    DonationSuccessView()
}
