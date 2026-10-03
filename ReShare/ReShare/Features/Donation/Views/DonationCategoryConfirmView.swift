import SwiftUI

/// Màn hình Xác nhận AI & Hoàn tất Quyên góp (Hướng A: All-in-One gọn gàng)
struct DonationCategoryConfirmView: View {
    @Environment(\.dismiss) private var dismiss
    
    // Ảnh chụp nhận từ Camera
    var capturedImage: UIImage? = nil
    
    // MARK: - State lưu trữ dữ liệu món đồ
    @State private var itemTitle: String = "Men's Warm Windbreaker" // AI tự gợi ý sẵn tên
    @State private var selectedCategory: DonationCategory = .clothing
    @State private var selectedCondition: ItemCondition = .good
    @State private var aiConfidence: Int = 94
    @State private var isSubmitting: Bool = false
    
    // Callback khi nộp thành công món đồ
    var onSubmit: (DonationItem) -> Void = { _ in }
    var onRetake: () -> Void = {}
    
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                // MARK: 1. TOP BAR
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(Color.primary)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(Color.white))
                            .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
                    }
                    
                    Spacer()
                    
                    // Badge trạng thái
                    HStack(spacing: 6) {
                        Circle().fill(Color.green).frame(width: 6, height: 6)
                        Text("PHOTO CAPTURED")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.green.opacity(0.12)))
                    
                    Spacer()
                    
                    Button(action: onRetake) {
                        Text("Retake")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                
                // MARK: 2. PREVIEW ẢNH ĐÃ CHỤP
                ZStack(alignment: .bottomTrailing) {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(red: 0.94, green: 0.96, blue: 0.92))
                        .frame(height: 220)
                    
                    if let image = capturedImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                    } else {
                        VStack(spacing: 6) {
                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 48))
                                .foregroundColor(Color(red: 0.20, green: 0.35, blue: 0.25).opacity(0.6))
                            Text("Item Photo Preview")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    
                    // Badge "✓ Clear shot"
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                        Text("Clear shot")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(Color.primary.opacity(0.8))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.92))
                            .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
                    )
                    .padding(12)
                }
                .padding(.horizontal, 20)
                
                // MARK: 3. KHỐI AI CATEGORY (3 THẺ CHỌN)
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                            Text("AI CATEGORY SUGGESTION")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        // Badge điểm CoreML
                        Text("CoreML • \(aiConfidence)%")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.green.opacity(0.12)))
                    }
                    
                    // 3 THẺ CHỌN DANH MỤC
                    HStack(spacing: 10) {
                        CategorySelectionCard(
                            title: "Clothes",
                            subtitle: "Suggested",
                            iconName: "tshirt",
                            isSelected: selectedCategory == .clothing,
                            action: { selectedCategory = .clothing }
                        )
                        
                        CategorySelectionCard(
                            title: "Books",
                            subtitle: "Stories & Edu",
                            iconName: "book.closed",
                            isSelected: selectedCategory == .books,
                            action: { selectedCategory = .books }
                        )
                        
                        CategorySelectionCard(
                            title: "Household",
                            subtitle: "Decor & Tools",
                            iconName: "house",
                            isSelected: selectedCategory == .household,
                            action: { selectedCategory = .household }
                        )
                    }
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                .padding(.horizontal, 20)
                
                // MARK: 4. THÔNG TIN CHI TIẾT (TÊN & TÌNH TRẠNG)
                VStack(alignment: .leading, spacing: 14) {
                    // Ô nhập Tên món đồ (AI đã gợi ý sẵn)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Item Title *")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                        
                        HStack {
                            TextField("Enter item title", text: $itemTitle)
                                .font(.system(size: 15, weight: .medium))
                            
                            if !itemTitle.isEmpty {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(Color.green)
                            }
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(uiColor: .systemGray6))
                        )
                    }
                    
                    // Chọn Tình trạng đồ (ItemCondition)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Item Condition *")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                        
                        // 4 nút tình trạng: New, Like New, Good, Fair
                        HStack(spacing: 8) {
                            ForEach(ItemCondition.allCases) { condition in
                                Button(action: { selectedCondition = condition }) {
                                    Text(condition.title)
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(selectedCondition == condition ? .white : Color.primary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .background(
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(selectedCondition == condition ? Color(red: 0.15, green: 0.35, blue: 0.20) : Color(uiColor: .systemGray6))
                                        )
                                }
                            }
                        }
                        
                        // Câu giải thích tình trạng tự động cập nhật
                        Text(selectedCondition.description)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .italic()
                    }
                    
                    // Badge 100% Charity
                    HStack(spacing: 6) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Color.green)
                        
                        Text("Pricing model: Free / 0đ (100% Charity Community)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.green.opacity(0.10)))
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 18).fill(Color.white))
                .padding(.horizontal, 20)
                
                // MARK: 5. NÚT SUBMIT TO NỔI BẬT
                Button(action: handleSubmission) {
                    HStack(spacing: 8) {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Submit Donation Request")
                                .font(.system(size: 16, weight: .bold))
                            
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 14))
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color(red: 0.11, green: 0.35, blue: 0.20)) // Màu xanh rêu chủ đạo ReShare
                    )
                }
                .buttonStyle(ScaleButtonStyle())
                .disabled(itemTitle.isEmpty || isSubmitting)
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarHidden(true)
    }
    
    // MARK: - Logic tạo DonationItem mới
    private func handleSubmission() {
        isSubmitting = true
        
        let newItem = DonationItem(
            id: UUID().uuidString,
            donorId: "user_current",
            title: itemTitle,
            description: selectedCondition.description,
            category: selectedCategory,
            condition: selectedCondition,
            status: .pending,
            imageUrl: nil,
            createdAt: Date(),
            statusNote: "Waiting for admin review"
        )
        
        // Giả lập lưu nhanh rồi hoàn tất
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            isSubmitting = false
            onSubmit(newItem)
            dismiss()
        }
    }
}

// MARK: - Component Card chọn Category
struct CategorySelectionCard: View {
    let title: String
    let subtitle: String
    let iconName: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack(alignment: .topTrailing) {
                    Circle()
                        .fill(isSelected ? Color.white.opacity(0.2) : Color.green.opacity(0.10))
                        .frame(width: 38, height: 38)
                    
                    Image(systemName: iconName)
                        .font(.system(size: 17))
                        .foregroundColor(isSelected ? .white : Color(red: 0.15, green: 0.35, blue: 0.20))
                        .frame(width: 38, height: 38)
                    
                    if isSelected {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 12, height: 12)
                            .overlay(
                                Image(systemName: "checkmark")
                                    .font(.system(size: 7, weight: .bold))
                                    .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.20))
                            )
                            .offset(x: 3, y: -2)
                    }
                }
                
                VStack(spacing: 1) {
                    Text(title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(isSelected ? .white : Color.primary)
                    
                    Text(subtitle)
                        .font(.system(size: 9))
                        .foregroundColor(isSelected ? .white.opacity(0.8) : .secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isSelected ? Color(red: 0.15, green: 0.35, blue: 0.20) : Color(uiColor: .systemGray6))
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

#Preview {
    DonationCategoryConfirmView()
}
