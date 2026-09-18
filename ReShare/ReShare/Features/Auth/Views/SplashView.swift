//
//  SplashView.swift
//  ReShare
//
//  Màn hình chờ (Splash Screen) với hiệu ứng chuyển động thương hiệu
//

import SwiftUI

struct SplashView: View {
    // State quản lý hiệu ứng xuất hiện của Logo
    @State private var isAnimating: Bool = false
    
    // Binding hoặc Callback để báo cho View cha biết khi màn hình chờ kết thúc
    var onFinished: () -> Void
    
    var body: some View {
        ZStack {
            // 1. Nền màu sáng theo chuẩn Design System
            AppColors.background
                .ignoresSafeArea()
            
            VStack {
                Spacer()
                
                // 2. Cụm Logo và Slogan ở trung tâm màn hình
                VStack(spacing: 16) {
                    // Logo ứng dụng từ Assets
                    Image("AvatarApp")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 110, height: 110)
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                        .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 5)
                    
                    // Tên ứng dụng "ReShare"
                    Text("ReShare")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(AppColors.primary) // Xanh thương hiệu đậm
                    
                    // Slogan tiếng Anh
                    Text("Give useful items a second life")
                        .font(.system(size: 16, weight: .regular, design: .default))
                        .foregroundColor(AppColors.textSecondary)
                }
                // Áp dụng Animation Scale & Fade In
                .scaleEffect(isAnimating ? 1.0 : 0.85)
                .opacity(isAnimating ? 1.0 : 0.0)
                
                Spacer()
                
                // 3. Footer thông điệp ở đáy màn hình
                Text("Một vòng tuần hoàn yêu thương")
                    .font(.system(size: 13, weight: .medium, design: .default))
                    .foregroundColor(AppColors.textTertiary)
                    .padding(.bottom, 24)
                    .opacity(isAnimating ? 0.9 : 0.0)
            }
        }
        .onAppear {
            // Kích hoạt hiệu ứng xuất hiện mượt mà
            withAnimation(.easeOut(duration: 0.8)) {
                isAnimating = true
            }
            
            // Giữ màn hình chờ trong 2 giây rồi chuyển tiếp
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                withAnimation(.easeInOut(duration: 0.4)) {
                    onFinished()
                }
            }
        }
    }
}

// MARK: - Preview Canvas
#Preview {
    SplashView(onFinished: {})
}
