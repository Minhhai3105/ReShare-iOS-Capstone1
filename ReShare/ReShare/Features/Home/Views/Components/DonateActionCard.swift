import SwiftUI

/// Hero Card mở luồng chụp ảnh và tạo đơn quyên góp thử nghiệm
struct DonateActionCard: View {
    var onAction: () -> Void = {}

    var body: some View {
        Button(action: onAction) {
            VStack(alignment: .leading, spacing: 16) {
                // Hàng 1: Icon Camera + Badge trạng thái thử nghiệm
                HStack {
                    // Icon Camera trong khung mờ
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.white.opacity(0.15))
                            .frame(width: 44, height: 44)

                        Image(systemName: "camera")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    Spacer()

                    Text("Bản thử nghiệm")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(Color(red: 0.88, green: 0.55, blue: 0.22)) // Màu cam đất nhạt
                        )
                }

                // Hàng 2: Tiêu đề & Mô tả
                VStack(alignment: .leading, spacing: 6) {
                    Text("Quyên góp đồ dùng")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)

                    Text("Chụp ít nhất 3 ảnh, tự chọn danh mục và lưu đơn thử nghiệm. Chưa có trạm nhận đồ thật.")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(.white.opacity(0.85))
                        .lineSpacing(2)
                        .multilineTextAlignment(.leading)
                }

                // Hàng 3: Thời gian ước tính + Nút mũi tên tròn
                HStack {
                    Text("Chụp 3–6 ảnh món đồ")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(red: 0.65, green: 0.88, blue: 0.70)) // Xanh bạc hà nhạt

                    Spacer()

                    // Nút tròn trắng mũi tên xanh
                    ZStack {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 32, height: 32)

                        Image(systemName: "arrow.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(Color(red: 0.11, green: 0.27, blue: 0.16))
                    }
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(red: 0.11, green: 0.27, blue: 0.16)) // Xanh rừng rậm đậm chuẩn Figma
            )
            .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 4)
        }
        .buttonStyle(ScaleButtonStyle()) // Hiệu ứng thu nhỏ nhẹ khi bấm
        .padding(.horizontal, 20)
    }
}

// MARK: - Hiệu ứng chạm Button êm ái
struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

#Preview {
    DonateActionCard()
        .padding(.vertical)
        .background(Color(uiColor: .systemGroupedBackground))
}
