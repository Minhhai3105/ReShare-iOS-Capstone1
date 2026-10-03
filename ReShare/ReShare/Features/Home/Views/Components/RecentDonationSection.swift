import SwiftUI

/// Khung chứa toàn bộ danh sách Recent Donations trên màn hình Home
struct RecentDonationsSection: View {
    let items: [DonationItem]
    var onSeeAll: () -> Void = {}
    var onSelectItem: ((DonationItem) -> Void)? = nil
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Tiêu đề Section + Badge đếm số lượng + Nút See All
            HStack(spacing: 8) {
                Text("Quyên góp gần đây")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Color.primary)
                
                // Badge đếm số lượng đang xử lý
                Text("\(items.count) đơn đang xử lý")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(Color(uiColor: .systemGray5))
                    )
                
                Spacer()
                
                // Nút "Xem tất cả" màu xanh
                Button(action: onSeeAll) {
                    Text("Xem tất cả")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                }
            }
            .padding(.horizontal, 20)
            
            // Khung Card trắng chứa danh sách các món đồ
            VStack(spacing: 0) {
                if items.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "heart.text.square")
                            .font(.system(size: 28))
                            .foregroundColor(.secondary.opacity(0.4))
                        Text("Chưa có đơn quyên góp nào")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text("Bấm nút Chụp ảnh phía trên để gửi món đồ quyên góp đầu tiên nhé!")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary.opacity(0.8))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                } else {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        Button(action: {
                            onSelectItem?(item) ?? onSeeAll()
                        }) {
                            RecentDonationRow(item: item)
                        }
                        .buttonStyle(PlainButtonStyle())
                        
                        // Đường kẻ phân cách giữa các item (trừ item cuối cùng)
                        if index < items.count - 1 {
                            Divider()
                                .padding(.leading, 60) // Thụt đầu dòng khớp với icon
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white)
            )
            .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
            .padding(.horizontal, 20)
        }
    }
}

#Preview {
    RecentDonationsSection(items: DonationItem.mockRecentItems)
        .padding(.vertical)
        .background(Color(uiColor: .systemGroupedBackground))
}
