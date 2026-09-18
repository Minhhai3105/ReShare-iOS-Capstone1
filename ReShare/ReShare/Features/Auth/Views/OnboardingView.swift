//
//  OnboardingView.swift
//  ReShare
//
//  Created by Cao Hai on 15/9/26.
//

import SwiftUI

// MARK: - 1. Model dữ liệu Onboarding
struct OnboardingItem: Identifiable {
    let id: Int
    let title: String
    let description: String
    let badgeText: String
    let badgeIcon: String
    let imageName: String
    let footerText: String
    let footerIcon: String
}

// MARK: - 2. Giao diện chính Onboarding
struct OnboardingView: View {
    // Lưu cờ vào UserDefaults để không hiển thị lại sau khi đã xem xong
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding: Bool = false
    
    // Quản lý trang hiện tại (0, 1, 2)
    @State private var currentPage: Int = 0
    
    // Callback khi hoàn tất hoặc bấm Bỏ qua
    var onFinished: () -> Void
    
    // Danh sách 3 màn hình Onboarding khớp 100% với Figma
    private let steps: [OnboardingItem] = [
        OnboardingItem(
            id: 0,
            title: "Quyên góp trong vài phút",
            description: "Chỉ cần chụp ảnh món đồ và gửi lời trao tặng nhẹ nhàng, chẳng ngại gõ phím.",
            badgeText: "1 Chạm",
            badgeIcon: "camera.fill",
            imageName: "Onboarding1",
            footerText: "Hơn 12.000 món đồ đã được tái sinh vòng đời",
            footerIcon: "clock.arrow.circlepath"
        ),
        OnboardingItem(
            id: 1,
            title: "Gợi ý phân loại thông minh",
            description: "ReShare gợi ý danh mục món đồ ngay trên thiết bị, bạn có thể tùy chỉnh lại dễ dàng mà không lo lộ dữ liệu cá nhân.",
            badgeText: "Tự động nhận diện",
            badgeIcon: "sparkles",
            imageName: "Onboarding2",
            footerText: "Xử lý an toàn 100% trên thiết bị, bảo mật riêng tư",
            footerIcon: "checkmark.shield.fill"
        ),
        OnboardingItem(
            id: 2,
            title: "Theo dõi hành trình mới",
            description: "Dễ dàng theo dõi tình trạng món đồ và khám phá thêm các vật phẩm hữu ích từ cộng đồng.",
            badgeText: "Minh bạch 100%",
            badgeIcon: "checkmark.circle.fill",
            imageName: "Onboarding3",
            footerText: "Kết nối trao tặng & tái sinh vòng đời đồ dùng minh bạch",
            footerIcon: "leaf.fill"
        )
    ]
    
    var body: some View {
        ZStack {
            AppColors.background
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header điều hướng trên cùng
                headerView
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                
                // Vùng nội dung trượt qua lại giữa 3 trang
                TabView(selection: $currentPage) {
                    ForEach(steps) { step in
                        stepContentView(step: step)
                            .tag(step.id)
                    }
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                
                // 3 Dấu chấm chuyển trang
                pageIndicator
                    .padding(.bottom, 24)
                
                // Nút Tiếp tục / Bắt đầu ngay
                actionButton
                    .padding(.horizontal, 24)
                
                // Thông điệp footer
                footerNoteView
                    .padding(.top, 14)
                    .padding(.bottom, 20)
            }
        }
    }
    
    // MARK: - Subviews
    
    private var headerView: some View {
        HStack {
            if currentPage > 0 {
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        currentPage -= 1
                    }
                }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(AppColors.primary)
                }
            } else {
                HStack(spacing: 6) {
                    Image("AvatarApp")
                        .resizable()
                        .frame(width: 24, height: 24)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    Text("ReShare")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(AppColors.primary)
                }
            }
            
            Spacer()
            
            if currentPage > 0 {
                HStack(spacing: 6) {
                    Image("AvatarApp")
                        .resizable()
                        .frame(width: 24, height: 24)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    Text("ReShare")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(AppColors.primary)
                }
                Spacer()
            }
            
            if currentPage < steps.count - 1 {
                Button("Bỏ qua") {
                    finishOnboarding()
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppColors.textSecondary)
            } else if currentPage > 0 {
                Color.clear.frame(width: 44, height: 20)
            }
        }
        .frame(height: 44)
    }
    
    private func stepContentView(step: OnboardingItem) -> some View {
        VStack(spacing: 24) {
            Spacer()
            
            // 1. Card nền trắng nổi bật (Kích thước và vị trí đồng nhất tuyệt đối)
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 290)
                    .shadow(color: Color.black.opacity(0.04), radius: 12, x: 0, y: 4)
                
                // Khung ảnh minh họa cố định chiều cao 210pt cho cả 3 ảnh
                VStack {
                    Spacer()
                    if UIImage(named: step.imageName) != nil {
                        Image(step.imageName)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 210)
                    } else {
                        Image(systemName: step.badgeIcon)
                            .font(.system(size: 80))
                            .foregroundColor(AppColors.primary.opacity(0.3))
                            .frame(height: 210)
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity)
                
                // Chip Badge nhỏ ở góc dưới card
                HStack(spacing: 4) {
                    Image(systemName: step.badgeIcon)
                        .font(.system(size: 11, weight: .semibold))
                    Text(step.badgeText)
                        .font(.system(size: 11, weight: .bold))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(AppColors.background)
                .foregroundColor(AppColors.primary)
                .cornerRadius(12)
                .padding(14)
            }
            .padding(.horizontal, 20)
            
            // 2. Tiêu đề và nội dung (Khóa chiều cao để thẻ trắng không bị nhảy vị trí khi lướt)
            VStack(spacing: 10) {
                Text(step.title)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(AppColors.primary)
                    .multilineTextAlignment(.center)
                
                Text(step.description)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(AppColors.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 16)
            }
            .frame(height: 95, alignment: .top)
            
            Spacer()
        }
    }
    
    private var pageIndicator: some View {
        HStack(spacing: 6) {
            ForEach(0..<steps.count, id: \.self) { index in
                Capsule()
                    .fill(currentPage == index ? AppColors.primary : Color.gray.opacity(0.3))
                    .frame(width: currentPage == index ? 20 : 6, height: 6)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentPage)
            }
        }
    }
    
    private var actionButton: some View {
        Button(action: {
            if currentPage < steps.count - 1 {
                withAnimation(.easeInOut(duration: 0.3)) {
                    currentPage += 1
                }
            } else {
                finishOnboarding()
            }
        }) {
            HStack(spacing: 8) {
                Text(currentPage == steps.count - 1 ? "Bắt đầu ngay" : "Tiếp tục")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(AppColors.primary)
            .foregroundColor(.white)
            .cornerRadius(16)
            .shadow(color: AppColors.primary.opacity(0.3), radius: 8, x: 0, y: 4)
        }
    }
    
    private var footerNoteView: some View {
        let currentItem = steps[currentPage]
        return HStack(spacing: 6) {
            Image(systemName: currentItem.footerIcon)
                .font(.system(size: 11))
            Text(currentItem.footerText)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(AppColors.textTertiary)
    }
    
    private func finishOnboarding() {
        hasSeenOnboarding = true
        withAnimation(.easeInOut(duration: 0.4)) {
            onFinished()
        }
    }
}

// MARK: - Preview Canvas
#Preview {
    OnboardingView(onFinished: {})
}
