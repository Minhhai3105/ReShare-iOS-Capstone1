import SwiftUI

/// Model thông tin Trạm tiếp nhận ReShare Hub tại Đà Nẵng
struct ReShareHubInfo: Identifiable {
    let id: String
    let name: String
    let address: String
}

/// Bảng các địa điểm minh hoạ; hiện chưa có trạm ReShare hoạt động.
struct HubsListSheet: View {
    @Environment(\.dismiss) private var dismiss
    
    // Màu sắc nhận diện ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)
    
    // 3 địa điểm demo, không dùng để dẫn đường hoặc hẹn giao đồ thật
    private let hubs: [ReShareHubInfo] = [
        ReShareHubInfo(
            id: "hub-1",
            name: "Điểm mẫu Hải Châu",
            address: "Quận Hải Châu, Đà Nẵng (vị trí minh hoạ)"
        ),
        ReShareHubInfo(
            id: "hub-2",
            name: "Điểm mẫu Ngũ Hành Sơn",
            address: "Quận Ngũ Hành Sơn, Đà Nẵng (vị trí minh hoạ)"
        ),
        ReShareHubInfo(
            id: "hub-3",
            name: "Điểm mẫu Liên Chiểu",
            address: "Quận Liên Chiểu, Đà Nẵng (vị trí minh hoạ)"
        )
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    // Header giới thiệu mạng lưới trạm
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Điểm tiếp nhận mẫu tại Đà Nẵng")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(primaryGreen)
                        
                        Text("Các điểm này chỉ để thử giao diện. ReShare chưa vận hành trạm tiếp nhận; đừng mang đồ tới các vị trí minh hoạ.")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineSpacing(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.top, 10)
                    
                    // Danh sách 3 trạm
                    VStack(spacing: 14) {
                        ForEach(hubs) { hub in
                            hubCard(for: hub)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
            .navigationTitle("Điểm tiếp nhận mẫu")
            .navigationBarTitleDisplayMode(.inline)
            .preferredColorScheme(.light)
            .environment(\.colorScheme, .light)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Đóng") { dismiss() }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(primaryGreen)
                }
            }
        }
    }
    
    private func hubCard(for hub: ReShareHubInfo) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(hub.name)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Color(red: 0.11, green: 0.15, blue: 0.13))
                    
                    Text(hub.address)
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.40, green: 0.46, blue: 0.42))
                }
                
                Spacer()

                Text("Chưa hoạt động")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(softMint)
                    .clipShape(Capsule())
            }
            
            Divider()
            
            Text("Không có địa chỉ nhận đồ, số điện thoại hoặc lịch mở cửa thực tế.")
                .font(.system(size: 11))
                .foregroundColor(Color(red: 0.45, green: 0.50, blue: 0.46))
        }
        .padding(16)
        .background(Color.white)
        .cornerRadius(18)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.black.opacity(0.08), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
    }
    
}

#Preview {
    HubsListSheet()
}
