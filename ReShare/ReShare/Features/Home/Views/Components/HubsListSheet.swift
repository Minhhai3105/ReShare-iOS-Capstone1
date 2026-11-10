import SwiftUI

/// Danh sách điểm tiếp nhận đọc từ Firestore (`hubs`). Điểm có cờ minh hoạ được ghi rõ là chưa hoạt động.
struct HubsListSheet: View {
    @Environment(\.dismiss) private var dismiss

    // Màu sắc nhận diện ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let softMint = Color(red: 0.88, green: 0.96, blue: 0.90)

    @State private var hubs: [HubRecord] = []
    @State private var isLoading: Bool = true
    @State private var loadFailed: Bool = false

    private var allDemo: Bool { hubs.allSatisfy(\.isDemo) }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    // Header giới thiệu mạng lưới trạm
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Điểm tiếp nhận tại Đà Nẵng")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(primaryGreen)

                        Text(allDemo
                             ? "Các điểm hiện đang minh hoạ. ReShare chưa vận hành trạm tiếp nhận; đừng mang đồ tới các vị trí này."
                             : "Chỉ mang đồ tới điểm đang hoạt động sau khi đơn quyên góp được kho duyệt.")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineSpacing(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.top, 10)

                    VStack(spacing: 14) {
                        if isLoading && hubs.isEmpty {
                            ProgressView("Đang tải điểm tiếp nhận…")
                                .font(.system(size: 12))
                        } else if hubs.isEmpty {
                            Text(loadFailed
                                 ? "Không tải được danh sách. Kéo xuống để thử lại."
                                 : "Chưa có điểm tiếp nhận nào đang hoạt động.")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        }
                        ForEach(hubs) { hub in
                            hubCard(for: hub)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
            .task { await loadHubs() }
            .refreshable { await loadHubs() }
            .navigationTitle("Điểm tiếp nhận")
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

    private func loadHubs() async {
        isLoading = true
        do {
            hubs = try await FirestoreService.shared.fetchActiveHubs()
            loadFailed = false
        } catch {
            loadFailed = true
        }
        isLoading = false
    }

    private func hubCard(for hub: HubRecord) -> some View {
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

                Text(hub.isDemo ? "Minh hoạ" : "Đang hoạt động")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(hub.isDemo ? .orange : primaryGreen)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(softMint)
                    .clipShape(Capsule())
            }

            Divider()

            Text(hub.isDemo
                 ? "Không có địa chỉ nhận đồ, số điện thoại hoặc lịch mở cửa thực tế."
                 : "⏰ \(hub.openHours)")
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
