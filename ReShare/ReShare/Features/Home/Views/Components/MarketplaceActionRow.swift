import SwiftUI

/// Hàng nút điều hướng nhanh sang Chợ đồ cũ Marketplace
struct MarketplaceActionRow: View {
    var onAction: () -> Void = {}
    
    var body: some View {
        Button(action: onAction) {
            HStack(spacing: 14) {
                // Icon túi đồ bọc trong khung xanh mint
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.green.opacity(0.12))
                        .frame(width: 48, height: 48)
                    
                    Image(systemName: "bag.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                }
                
                // Nội dung chữ ở giữa
                VStack(alignment: .leading, spacing: 3) {
                    Text("Kho đồ 0đ (Trao tặng cộng đồng)")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Color.primary)
                    
                    Text("Tìm kiếm và nhận đồ dùng miễn phí tại Đà Nẵng")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
                
                // Mũi tên điều hướng bên phải
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(uiColor: .tertiaryLabel))
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white)
            )
            .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
        }
        .buttonStyle(ScaleButtonStyle())
        .padding(.horizontal, 20)
    }
}

#Preview {
    MarketplaceActionRow()
        .padding(.vertical)
        .background(Color(uiColor: .systemGroupedBackground))
}
