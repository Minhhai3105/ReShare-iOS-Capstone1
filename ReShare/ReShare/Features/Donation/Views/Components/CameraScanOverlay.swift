import SwiftUI

/// Khung ngắm quét AI công nghệ cao với tia laser và thẻ định vị thông minh (ReShare Vision 2.0)
struct CameraScanOverlay: View {
    var detectedItemTitle: String = "Áo khoác gió nam (Size L)"
    var conditionText: String = "98% Mới"
    var isDetecting: Bool = true

    // State điều khiển vị trí tia laser quét từ 0.0 (đỉnh) đến 1.0 (đáy)
    @State private var laserProgress: CGFloat = 0.0

    // Màu xanh ngọc Neon nhận diện thương hiệu ReShare Vision
    private let neonEmerald = Color(red: 0.0, green: 0.90, blue: 0.46)

    init(
        detectedItemTitle: String = "Áo khoác gió nam (Size L)",
        conditionText: String = "98% Mới",
        isDetecting: Bool = true
    ) {
        self.detectedItemTitle = detectedItemTitle
        self.conditionText = conditionText
        self.isDetecting = isDetecting
    }

    // Khởi tạo tương thích với các view đang gọi tham số cũ
    init(detectedCategory: String, isAIReady: Bool) {
        self.detectedItemTitle = detectedCategory
        self.conditionText = "98% Mới"
        self.isDetecting = isAIReady
    }

    var body: some View {
        GeometryReader { geometry in
            let frameWidth = geometry.size.width * 0.82
            let frameHeight = frameWidth * 1.05

            ZStack {
                // 1. Khung viền mờ bo góc
                RoundedRectangle(cornerRadius: 24)
                    .stroke(neonEmerald.opacity(0.2), lineWidth: 1.5)
                    .frame(width: frameWidth, height: frameHeight)

                // 2. Bốn góc ngắm định vị (Corner Brackets)
                CornerBracketsShape()
                    .stroke(neonEmerald, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
                    .frame(width: frameWidth, height: frameHeight)
                    // Đổ bóng phát sáng (Neon Glow Effect)
                    .shadow(color: neonEmerald.opacity(0.6), radius: 8, x: 0, y: 0)

                // 3. Tia Laser quét phát sáng
                if isDetecting {
                    laserBeam(width: frameWidth, height: frameHeight)
                }

                // 4. Smart Tag: Ghim thông tin nhận diện đồ dùng
                VStack {
                    Spacer()
                    smartDetectionTag
                        .padding(.bottom, 16)
                }
                .frame(width: frameWidth, height: frameHeight)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onAppear {
                // Kích hoạt diễn hoạt laser chạy lặp vô tận trên Render Server (GPU)
                withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                    laserProgress = 1.0
                }
            }
        }
    }

    // MARK: - Component Tia Laser
    private func laserBeam(width: CGFloat, height: CGFloat) -> some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        neonEmerald.opacity(0.0),
                        neonEmerald.opacity(0.5),
                        neonEmerald,
                        neonEmerald.opacity(0.5),
                        neonEmerald.opacity(0.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(width: width - 8, height: 2.5)
            .shadow(color: neonEmerald, radius: 10, y: 0)
            // Di chuyển tia laser từ đỉnh xuống đáy khung ngắm
            .offset(y: -height / 2 + (height * laserProgress))
    }

    // MARK: - Smart Tag hiển thị kết quả AI
    private var smartDetectionTag: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(neonEmerald)
                .frame(width: 8, height: 8)
                .shadow(color: neonEmerald, radius: 4)

            Text(detectedItemTitle)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)

            Text("•")
                .foregroundColor(.white.opacity(0.5))

            Text(conditionText)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(neonEmerald)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color.black.opacity(0.75))
                .overlay(Capsule().stroke(neonEmerald.opacity(0.4), lineWidth: 1))
        )
    }
}

// MARK: - Hình vẽ 4 góc ngắm tuỳ biến (Custom Shape Vector)
struct CornerBracketsShape: Shape {
    let bracketLength: CGFloat = 26
    let cornerRadius: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        var path = Path()

        // Góc trên - trái
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + bracketLength))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))
        path.addQuadCurve(to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + bracketLength, y: rect.minY))

        // Góc trên - phải
        path.move(to: CGPoint(x: rect.maxX - bracketLength, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + cornerRadius), control: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + bracketLength))

        // Góc dưới - phải
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - bracketLength))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - bracketLength, y: rect.maxY))

        // Góc dưới - trái
        path.move(to: CGPoint(x: rect.minX + bracketLength, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - bracketLength))

        return path
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        CameraScanOverlay()
    }
}
