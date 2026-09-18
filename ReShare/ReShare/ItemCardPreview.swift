import SwiftUI

struct ItemCardPreview: View {
    var body: some View {
        ZStack {
            AppColors.background.ignoresSafeArea()
            
            VStack(alignment: .leading, spacing: 12) {
                // Status Badge
                HStack {
                    Text("AI: Quần áo")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.brandPrimarySoft)
                        .foregroundColor(.brandPrimary)
                        .cornerRadius(6)
                    
                    Spacer()
                    
                    Text("Đã phân phối")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(.statusDistributed)
                }
                
                Text("Áo khoác gió mùa đông")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.textPrimary)
                
                Text("Kho quận Hải Châu • 1.2 km")
                    .font(.system(size: 14, design: .rounded))
                    .foregroundColor(.textSecondary)
                
                Divider().background(Color.borderSubtle)
                
                // Primary Action Button
                Button(action: {}) {
                    Text("Liên hệ nhận đồ")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.brandAccent)
                        .foregroundColor(.surfacePrimary)
                        .cornerRadius(8)
                }
            }
            .padding(16)
            .background(Color.surfacePrimary)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.borderSubtle, lineWidth: 1)
            )
            .padding(.horizontal, 20)
        }
    }
}

#Preview {
    ItemCardPreview()
}
