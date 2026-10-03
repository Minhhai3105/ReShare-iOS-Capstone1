import SwiftUI

/// Màn hình Kho đồ 0đ Cộng đồng (P2P Community Catalog tại Đà Nẵng)
struct CommunityCatalogView: View {
    @Environment(\.dismiss) private var dismiss
    
    // Nếu mở dạng Sheet thì hiện nút đóng, nếu ở Tabbar gốc thì ẩn nút Back
    var isSheet: Bool = false
    
    @State private var searchText: String = ""
    @State private var selectedCategoryIndex: Int = 0
    @State private var selectedDistrict: String = "Tất cả Đà Nẵng"
    
    // State mở Camera chụp ảnh đồ 0đ
    @State private var showPublishCamera: Bool = false
    @State private var loadError: String? = nil
    
    private var currentUserId: String {
        AuthService.shared.currentUserId ?? ""
    }
    
    // Danh sách danh mục & Quận huyện tại Đà Nẵng
    private let categories = ["Tất cả", "⭐️ Đồ của tôi", "👕 Quần áo", "📚 Sách vở", "🪑 Gia dụng", "🧸 Mẹ & Bé", "⚡ Đồ điện tử"]
    private let daNangDistricts = ["Tất cả Đà Nẵng", "Hải Châu", "Sơn Trà", "Ngũ Hành Sơn", "Thanh Khê", "Cẩm Lệ", "Liên Chiểu"]
    
    // Dữ liệu Kho đồ 0đ (100% Real Data nạp từ Cloud Firestore)
    @State private var catalogItems: [CatalogItem] = []
    
    // Cột lưới 2 cột
    private let gridColumns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]
    
    // MARK: - Bộ lọc dữ liệu thông minh thời gian thực (Computed Property)
    private var filteredItems: [CatalogItem] {
        catalogItems.filter { item in
            // 1. Lọc theo danh mục hoặc đồ của tôi
            let matchCategory: Bool
            let categoryName = categories[selectedCategoryIndex]
            if categoryName == "Tất cả" {
                matchCategory = true
            } else if categoryName == "⭐️ Đồ của tôi" {
                matchCategory = (!currentUserId.isEmpty && item.donorId == currentUserId)
            } else {
                matchCategory = categoryName.contains(item.category)
            }
            
            // 2. Lọc theo Quận tại Đà Nẵng
            let matchDistrict = (selectedDistrict == "Tất cả Đà Nẵng") || (item.district == selectedDistrict)
            
            // 3. Lọc theo từ khóa tìm kiếm
            let cleanQuery = searchText.trimmingCharacters(in: .whitespaces)
            let matchSearch = cleanQuery.isEmpty || item.title.localizedCaseInsensitiveContains(cleanQuery)
            
            return matchCategory && matchDistrict && matchSearch
        }
    }
    
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    // 1. Header có Bộ chọn Quận tại Đà Nẵng (Đã bỏ icon chuông và ẩn nút Back nếu ở Tabbar gốc)
                    topHeaderSection
                    
                    // 2. Thanh tìm kiếm
                    searchBarSection
                    
                    // 3. Dải trượt danh mục phân loại
                    categoryFilterSection
                    
                    // 4. Lưới 2 cột hiển thị các món đồ đã lọc (Dùng Push NavigationLink, không bị chồng Sheet)
                    if let loadError {
                        VStack(spacing: 6) {
                            Text(loadError)
                            Button("Thử lại") { Task { await loadCatalog() } }
                        }
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                    }
                    itemsGridView
                    
                    // 5. Banner tuần hoàn cộng đồng Đà Nẵng
                    circularEconomyBanner
                        .padding(.top, 8)
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 70) // Đệm tránh nút nổi che
            }
            .refreshable {
                await loadCatalog()
            }
            
            // Nút nổi FAB Đăng tặng đồ 0đ (Mở quy trình Camera chụp ảnh thực tế)
            Button(action: { showPublishCamera = true }) {
                HStack(spacing: 8) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 15, weight: .bold))
                    Text("Đăng tặng đồ")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(Color(red: 0.11, green: 0.35, blue: 0.20))
                .clipShape(Capsule())
                .shadow(color: Color.black.opacity(0.2), radius: 6, x: 0, y: 3)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 20)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationBarHidden(true)
        // Mở toàn màn hình Camera chụp ảnh thực tế đồ 0đ
        .fullScreenCover(isPresented: $showPublishCamera) {
            NavigationStack {
                DonationCameraView(
                    onFinishCapturing: nil,
                    onBackToHome: {
                        showPublishCamera = false
                    },
                    mode: .communityCatalog,
                    onCatalogPublished: { newItem in
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            catalogItems.insert(newItem, at: 0)
                        }
                    }
                )
            }
        }
        .task {
            await loadCatalog()
        }
    }
    
    // Tải danh sách đồ 0đ thật từ Cloud Firestore
    private func loadCatalog() async {
        do {
            let liveItems = try await FirestoreService.shared.fetchCatalogItems()
            await MainActor.run {
                self.catalogItems = liveItems
                self.loadError = nil
            }
        } catch {
            await MainActor.run {
                self.loadError = "Không thể tải Kho đồ 0đ: \(error.localizedDescription)"
            }
        }
    }
    
    // MARK: - 1. Top Header
    private var topHeaderSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                // Chỉ hiện nút Back khi màn hình mở dưới dạng Sheet
                if isSheet {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(Color.white))
                            .shadow(color: Color.black.opacity(0.05), radius: 4)
                    }
                }
                
                Text("Kho đồ 0đ")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                
                Spacer()
            }
            
            // Dropdown chọn Quận tại Đà Nẵng kèm đếm số món phù hợp
            Menu {
                ForEach(daNangDistricts, id: \.self) { dist in
                    Button(dist) { selectedDistrict = dist }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.circle.fill")
                        .foregroundColor(Color(red: 0.20, green: 0.65, blue: 0.38))
                    Text("📍 \(selectedDistrict) • \(filteredItems.count) món phù hợp")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    
    // MARK: - 2. Thanh tìm kiếm
    private var searchBarSection: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            
            TextField("Tìm quần áo, sách vở, đồ dùng 0đ...", text: $searchText)
                .font(.system(size: 14))
            
            if !searchText.isEmpty {
                Button(action: { searchText = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
    }
    
    // MARK: - 3. Dải chọn Danh mục
    private var categoryFilterSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(0..<categories.count, id: \.self) { idx in
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedCategoryIndex = idx
                        }
                    }) {
                        Text(categories[idx])
                            .font(.system(size: 13, weight: selectedCategoryIndex == idx ? .bold : .medium))
                            .foregroundColor(selectedCategoryIndex == idx ? .white : Color.primary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(selectedCategoryIndex == idx ? Color(red: 0.11, green: 0.35, blue: 0.20) : Color.white)
                            )
                            .shadow(color: Color.black.opacity(selectedCategoryIndex == idx ? 0.1 : 0.03), radius: 4)
                    }
                }
            }
        }
    }
    
    // MARK: - 4. Lưới hiển thị các món đồ đã lọc (Push NavigationLink mượt mà)
    private var itemsGridView: some View {
        Group {
            if filteredItems.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray.fill")
                        .font(.system(size: 38))
                        .foregroundColor(.secondary.opacity(0.4))
                        .padding(.top, 30)
                    
                    Text("Chưa có món đồ nào phù hợp với bộ lọc")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                    
                    Button(action: {
                        selectedCategoryIndex = 0
                        selectedDistrict = "Tất cả Đà Nẵng"
                        searchText = ""
                    }) {
                        Text("Đặt lại bộ lọc")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(Color.green.opacity(0.12))
                            .clipShape(Capsule())
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                LazyVGrid(columns: gridColumns, spacing: 14) {
                    ForEach(filteredItems) { item in
                        NavigationLink(destination: CatalogItemDetailView(item: item)) {
                            itemCardView(for: item)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
            }
        }
    }
    
    private func itemCardView(for item: CatalogItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Khung ảnh có Huy hiệu Free/0đ & Trạng thái
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(red: 0.92, green: 0.94, blue: 0.90))
                    .frame(height: 140)
                
                CatalogItemPhotoView(
                    urlString: item.photoURLs.first,
                    legacyBase64: item.imageBase64,
                    placeholderName: item.imageName
                )
                .frame(maxWidth: .infinity, maxHeight: 140)
                .clipped()
                .cornerRadius(14)
                
                // Huy hiệu Free / 0đ hoặc Đã có người hẹn
                HStack(spacing: 3) {
                    Text(item.status == .reserved ? "Đã hẹn lấy" : "Free / 0đ")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(item.status == .reserved ? Color.orange : Color(red: 0.08, green: 0.35, blue: 0.18))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(item.status == .reserved ? Color.white : Color(red: 0.55, green: 0.92, blue: 0.70))
                .clipShape(Capsule())
                .padding(8)
            }
            .overlay(alignment: .topTrailing) {
                if !currentUserId.isEmpty && item.donorId == currentUserId {
                    HStack(spacing: 3) {
                        Image(systemName: "person.fill")
                        Text("Đồ của bạn")
                    }
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Color(red: 0.11, green: 0.35, blue: 0.20))
                    .clipShape(Capsule())
                    .shadow(color: Color.black.opacity(0.18), radius: 3, x: 0, y: 1)
                    .padding(8)
                }
            }
            
            // Thông tin món đồ
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                HStack(spacing: 4) {
                    Image(systemName: "mappin.circle")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Text("\(item.district), Đà Nẵng")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                
                Text(item.timeAgo)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary.opacity(0.8))
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 6)
        }
        .padding(8)
        .background(Color.white)
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
    }
    
    // MARK: - 5. Banner tuần hoàn cộng đồng Đà Nẵng
    private var circularEconomyBanner: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color(red: 0.11, green: 0.35, blue: 0.20))
                    .frame(width: 40, height: 40)
                Image(systemName: "arrow.3.trianglepath")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text("Mục tiêu tuần hoàn Đà Nẵng")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                Text("Trao tặng trực tiếp tận tay giữa các gia đình trong thành phố.")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding(14)
        .background(Color(red: 0.88, green: 0.96, blue: 0.90))
        .cornerRadius(16)
    }
}

#Preview {
    NavigationStack {
        CommunityCatalogView()
    }
}
