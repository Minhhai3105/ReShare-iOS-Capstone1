import SwiftUI

/// Dải thông báo tác động cộng đồng (Số lượng đồ đã match & verify trong tuần)
struct CommunityImpactBanner: View {
    var count: Int = 42
    var location: String = "District 1"

    var body: some View {
        HStack(spacing: 8) {
            // Chấm cam biểu thị số liệu trực tiếp
            Circle()
                .fill(Color(red: 0.88, green: 0.55, blue: 0.22))
                .frame(width: 8, height: 8)

            // Dòng text số liệu
            HStack(spacing: 4) {
                Text("\(count) món đồ")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color.primary.opacity(0.85))

                Text("đã trao gửi & kiểm định tại \(location) tuần này")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Tag chữ "Tác động" màu cam đất
            Text("Tác động")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Color(red: 0.75, green: 0.45, blue: 0.22))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.99, green: 0.96, blue: 0.92)) // Nền kem cam nhạt
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(red: 0.88, green: 0.55, blue: 0.22).opacity(0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 20)
    }
}

#Preview {
    CommunityImpactBanner()
        .padding(.vertical)
        .background(Color(uiColor: .systemGroupedBackground))
}
