import SwiftUI

/// Component Header hiển thị lời chào và Avatar có chấm trạng thái xanh
struct HomeGreetingHeader: View {
    let userName: String
    var onAvatarTap: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center) {
            // Cột bên trái: Lời chào + Cây mầm 🌱 + Câu hỏi
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("Hi, \(userName)")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Color(red: 0.11, green: 0.27, blue: 0.16))

                    Text("🌱")
                        .font(.system(size: 20))
                }

                Text("Hôm nay bạn muốn sẻ chia điều gì?")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Góc bên phải: Avatar tròn viền xanh (Bấm vào mở Hồ sơ)
            Button(action: { onAvatarTap?() }) {
                ZStack(alignment: .bottomTrailing) {
                    Circle()
                        .stroke(Color(red: 0.11, green: 0.35, blue: 0.20).opacity(0.4), lineWidth: 1.5)
                        .background(Circle().fill(Color(red: 0.94, green: 0.97, blue: 0.94)))
                        .frame(width: 44, height: 44)

                    Text(getInitials(from: userName))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                        .frame(width: 44, height: 44)

                    // Chấm xanh trạng thái góc dưới
                    Circle()
                        .fill(Color.green)
                        .frame(width: 10, height: 10)
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                        .offset(x: -1, y: -1)
                }
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func getInitials(from name: String) -> String {
        let formatter = PersonNameComponentsFormatter()
        if let components = formatter.personNameComponents(from: name) {
            formatter.style = .abbreviated
            return formatter.string(from: components)
        }
        return String(name.prefix(2)).uppercased()
    }
}
