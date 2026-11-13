import SwiftUI
import MapKit

// MARK: - Model Trạm Tiếp Nhận ReShare Hub (đọc từ Firestore `hubs`)
struct ReShareHub: Identifiable {
    let id: String
    let name: String
    let address: String
    let coordinate: CLLocationCoordinate2D
    let openHours: String
    /// Điểm minh hoạ: đơn vẫn lưu thật nhưng không mang đồ tới đây.
    let isDemo: Bool

    init(record: HubRecord) {
        id = record.id
        name = record.name
        address = record.address
        coordinate = CLLocationCoordinate2D(latitude: record.latitude, longitude: record.longitude)
        openHours = record.openHours
        isDemo = record.isDemo
    }
}

/// Màn hình BƯỚC 2: Nhập thông tin chi tiết & Chọn Trạm ReShare Hub tại Đà Nẵng
struct DonationDetailsView: View {
    @Environment(\.dismiss) private var dismiss

    // Nhận mảng 3 - 6 ảnh vừa chụp từ Camera
    var capturedImages: [UIImage] = []
    /// Chiến dịch đang quyên góp (nil = quyên góp tự do). Có chiến dịch thì danh mục bị khoá
    /// theo chiến dịch và chỉ chọn được Hub của chiến dịch (rules cũng kiểm tra danh mục).
    var campaign: DonationCampaign? = nil
    var onBackToHome: (() -> Void)? = nil

    // MARK: - Điểm tiếp nhận đọc từ Firestore
    @State private var daNangHubs: [ReShareHub] = []
    @State private var isLoadingHubs: Bool = true
    @State private var hubsLoadFailed: Bool = false

    private var selectedHub: ReShareHub? {
        daNangHubs.indices.contains(selectedHubIndex) ? daNangHubs[selectedHubIndex] : nil
    }

    // MARK: - State dữ liệu
    @State private var itemTitle: String = ""
    @State private var quantityText: String = ""
    @State private var selectedUnit: DonationUnit = .piece
    @State private var selectedCategory: DonationCategory = .clothing
    @State private var aiPrediction: CatalogCategoryClassifier.Prediction? = nil
    @State private var isClassifying: Bool = false
    @State private var didClassify: Bool = false
    @State private var didConfirmCategory: Bool = false
    @State private var selectedCondition: ItemCondition = .good
    @State private var selectedHubIndex: Int = 0
    @State private var notes: String = ""
    @State private var deliveryMethod: Int = 0 // 0: Tự đem tới trạm, 1: Hẹn tình nguyện viên lấy

    // MARK: - Bảng màu chuẩn giao diện sáng, tương phản cao, chống lóa/trắng chữ
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let textDark = Color(red: 0.11, green: 0.15, blue: 0.13)
    private let textMuted = Color(red: 0.40, green: 0.46, blue: 0.42)
    private let sectionHeaderColor = Color(red: 0.32, green: 0.40, blue: 0.36)
    private let cardBorderColor = Color.black.opacity(0.08)

    // State điều khiển bản đồ MapKit tập trung vào Đà Nẵng
    @State private var mapRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 16.0678, longitude: 108.2208),
        span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
    )

    @State private var navigateToSuccess: Bool = false
    @State private var isSubmitting: Bool = false
    @State private var submitStatus: String? = nil
    @State private var donationDocumentId: String = UUID().uuidString
    /// Mã đơn hiển thị cho người quyên góp, lấy từ mã tài liệu thật của đơn (không còn số ngẫu nhiên):
    /// nhân sự đối chiếu được với mã đơn trên Web Admin.
    private var confirmationCode: String { "RS-" + String(donationDocumentId.prefix(8)).uppercased() }
    @State private var submittedItem: DonationItem? = nil
    @State private var uploadedImageAssets: [CloudinaryUploadedImage] = []
    @State private var errorMessage: String? = nil
    @State private var showErrorAlert: Bool = false

    // Custom Binding an toàn giúp cập nhật tâm bản đồ khi đổi Trạm
    private var selectedHubBinding: Binding<Int> {
        Binding(
            get: { selectedHubIndex },
            set: { newIndex in
                guard daNangHubs.indices.contains(newIndex) else { return }
                selectedHubIndex = newIndex
                withAnimation(.easeInOut(duration: 0.4)) {
                    mapRegion.center = daNangHubs[newIndex].coordinate
                }
            }
        )
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 20) {
                if let campaign {
                    campaignBanner(campaign)
                }

                // 1. Dải ảnh thu nhỏ cuộn ngang từ Camera
                capturedPhotosCarousel

                // 2. Form thông tin món đồ
                itemInfoSection

                // 3. Chọn Trạm tiếp nhận tại Đà Nẵng & Bản đồ MapKit
                hubSelectionSection

                // 4. Hình thức gửi đồ
                deliveryMethodSection

                // 5. Nút Hoàn tất gửi quyên góp
                submitDonationButton
                    .padding(.top, 10)
                    .padding(.bottom, 30)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationTitle("Thông tin quyên góp")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .onAppear {
            if let campaign { selectedCategory = campaign.donationCategory }
            classifyFirstPhoto()
        }
        .task { await loadHubs() }
        .toolbar(.visible, for: .navigationBar)
        .preferredColorScheme(.light)
        .environment(\.colorScheme, .light)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(primaryGreen)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white))
                        .shadow(color: Color.black.opacity(0.06), radius: 4)
                }
            }
        }
        // Điều hướng sang Bước 3: Màn hình Thành công
        .navigationDestination(isPresented: $navigateToSuccess) {
            DonationSuccessView(
                item: submittedItem,
                confirmationCode: submittedItem?.confirmationCode ?? confirmationCode,
                hubIsDemo: selectedHub?.isDemo ?? true,
                onBackToHome: {
                    if let onBackToHome = onBackToHome {
                        onBackToHome()
                    } else {
                        dismiss()
                    }
                }
            )
        }
        .alert("Gửi đơn quyên góp không thành công", isPresented: $showErrorAlert) {
            Button("Thử lại") {
                submitDonation()
            }
            Button("Hủy đơn", role: .destructive) {
                let assetsToClean = uploadedImageAssets
                let cancelledId = donationDocumentId
                uploadedImageAssets = []
                donationDocumentId = UUID().uuidString
                Task {
                    do {
                        try await CloudinaryImageService.shared.deleteImages(assetsToClean, purpose: .donation, recordId: cancelledId)
                    } catch {
                        print("⚠️ [Cloudinary] Không thể dọn ảnh của đơn đã hủy: \(error.localizedDescription)")
                    }
                }
            }
            Button("Đóng", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Đã có lỗi xảy ra trong quá trình lưu trữ đơn quyên góp.")
        }
    }

    // MARK: - 1. Dải ảnh chụp từ Camera
    private var capturedPhotosCarousel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ẢNH ĐÃ CHỤP (\(capturedImages.count) TẤM)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<capturedImages.count, id: \.self) { idx in
                        Image(uiImage: capturedImages[idx])
                            .resizable()
                            .scaledToFill()
                            .frame(width: 80, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white, lineWidth: 2))
                            .shadow(color: Color.black.opacity(0.08), radius: 4)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    // MARK: - 2. Form thông tin món đồ
    private var itemInfoSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("CHI TIẾT MÓN ĐỒ")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            VStack(spacing: 12) {
                TextField("Tên món đồ (VD: Áo ấm, Sách giáo khoa...)", text: $itemTitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(textDark)
                    .padding(14)
                    .background(Color.white)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(cardBorderColor, lineWidth: 1)
                    )

                // Phân loại danh mục
                HStack {
                    Text("Danh mục")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(textDark)
                    Spacer()
                    if let campaign {
                        Label(campaign.categoryTitle, systemImage: "lock.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(primaryGreen)
                    } else {
                        Picker("Danh mục", selection: Binding(
                            get: { selectedCategory },
                            set: { selectedCategory = $0; didConfirmCategory = true }
                        )) {
                            ForEach(DonationCategory.allCases) { cat in
                                Text(cat.title).tag(cat)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(primaryGreen)
                    }
                }
                .padding(14)
                .background(Color.white)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(cardBorderColor, lineWidth: 1)
                )

                if isClassifying {
                    Text("Đang phân tích ảnh đầu tiên… Bạn vẫn có thể chọn danh mục thủ công.")
                        .font(.system(size: 12))
                        .foregroundColor(textMuted)
                } else if let aiPrediction {
                    Text("AI gợi ý: \(aiPrediction.category.title) · \(Int((aiPrediction.confidence * 100).rounded()))% tin cậy\(aiPrediction.confidence < 0.6 ? " (thấp, hãy chọn thủ công)" : "")")
                        .font(.system(size: 12))
                        .foregroundColor(textMuted)
                    if let campaign, aiPrediction.confidence >= 0.6, aiPrediction.category != campaign.donationCategory {
                        Text("Ảnh có vẻ là \(aiPrediction.category.title.lowercased()), nhưng chiến dịch này chỉ nhận \(campaign.categoryTitle.lowercased()). Hãy kiểm tra lại món đồ hoặc quyên góp tự do.")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(red: 0.85, green: 0.45, blue: 0.10))
                    }
                } else if didClassify {
                    Text("Không có gợi ý AI. Bạn có thể chọn danh mục thủ công.")
                        .font(.system(size: 12))
                        .foregroundColor(textMuted)
                }

                if didConfirmCategory {
                    Label("Đã xác nhận danh mục: \(selectedCategory.title)", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(primaryGreen)
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                        .padding(.horizontal, 14)
                        .background(primaryGreen.opacity(0.08))
                        .cornerRadius(12)
                } else {
                    Button {
                        didConfirmCategory = true
                    } label: {
                        Label("Chạm để xác nhận danh mục: \(selectedCategory.title)", systemImage: "checkmark.circle")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            .padding(.horizontal, 14)
                            .background(primaryGreen)
                            .cornerRadius(12)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 12) {
                    TextField("Số lượng (VD: 2)", text: $quantityText)
                        .keyboardType(.decimalPad)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(textDark)

                    Picker("Đơn vị", selection: $selectedUnit) {
                        ForEach(DonationUnit.allCases) { unit in
                            Text(unit.title).tag(unit)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(primaryGreen)
                }
                .padding(14)
                .background(Color.white)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(cardBorderColor, lineWidth: 1)
                )

                // Chọn tình trạng đồ
                HStack {
                    Text("Độ mới")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(textDark)
                    Spacer()
                    Picker("Độ mới", selection: $selectedCondition) {
                        ForEach(ItemCondition.allCases) { cond in
                            Text(cond.title).tag(cond)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(primaryGreen)
                }
                .padding(14)
                .background(Color.white)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(cardBorderColor, lineWidth: 1)
                )
            }
        }
    }

    // MARK: - 3. Chọn Trạm tiếp nhận Đà Nẵng & MapKit
    private var hubSelectionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(campaign == nil ? "ĐIỂM TIẾP NHẬN" : "ĐIỂM TIẾP NHẬN CỦA CHIẾN DỊCH")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            if isLoadingHubs {
                ProgressView("Đang tải điểm tiếp nhận…")
                    .font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if let selectedHub {
                if selectedHub.isDemo {
                    Text("Điểm này đang minh hoạ: đơn được lưu thật và kho sẽ duyệt, nhưng chưa mang đồ tới vị trí trên bản đồ.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.85, green: 0.45, blue: 0.10))
                }
                hubPickerAndMap(selectedHub)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(hubsLoadFailed
                         ? "Không tải được điểm tiếp nhận. Kiểm tra kết nối rồi thử lại."
                         : "Chưa có điểm tiếp nhận nào đang hoạt động\(campaign == nil ? "" : " cho chiến dịch này"). Chưa thể gửi đơn.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.85, green: 0.45, blue: 0.10))
                    if hubsLoadFailed {
                        Button("Thử lại") { Task { await loadHubs() } }
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(primaryGreen)
                    }
                }
            }
        }
    }

    private func hubPickerAndMap(_ hub: ReShareHub) -> some View {
        VStack(alignment: .leading, spacing: 12) {

            // Picker chọn Trạm Đà Nẵng
            Picker("Trạm", selection: selectedHubBinding) {
                ForEach(0..<daNangHubs.count, id: \.self) { i in
                    Text(daNangHubs[i].name).tag(i)
                }
            }
            .pickerStyle(.segmented)

            // Bản đồ MapKit hiển thị vị trí Trạm
            Map(coordinateRegion: $mapRegion, annotationItems: [hub]) { hub in
                MapAnnotation(coordinate: hub.coordinate) {
                    VStack(spacing: 2) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 26))
                            .foregroundColor(primaryGreen)
                            .background(Circle().fill(Color.white).frame(width: 16, height: 16))
                            .shadow(radius: 4)

                        Text(hub.name)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(primaryGreen)
                            .cornerRadius(6)
                    }
                }
            }
            .frame(height: 160)
            .cornerRadius(14)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(cardBorderColor, lineWidth: 1)
            )

            // Địa chỉ & Giờ mở cửa
            HStack(spacing: 8) {
                Image(systemName: "mappin.circle.fill")
                    .foregroundColor(primaryGreen)
                    .font(.system(size: 16))

                VStack(alignment: .leading, spacing: 2) {
                    Text(hub.address)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(textDark)
                    Text("⏰ \(hub.openHours)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textMuted)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(cardBorderColor, lineWidth: 1)
            )
        }
    }

    // MARK: - 4. Hình thức gửi đồ
    private var deliveryMethodSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("HÌNH THỨC GỬI ĐỒ")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            HStack(spacing: 12) {
                // Giữ cả hai hình thức để demo; phần nào chưa vận hành thì nói rõ ngay trên thẻ.
                deliveryOptionCard(
                    title: "Gửi tại điểm",
                    subtitle: selectedHub?.isDemo == false ? "Mang đồ tới điểm đã chọn" : "Điểm đang minh hoạ",
                    icon: "figure.walk",
                    isSelected: deliveryMethod == 0,
                    onTap: { deliveryMethod = 0 }
                )

                deliveryOptionCard(
                    title: "Nhận tận nơi",
                    subtitle: "Chưa vận hành",
                    icon: "bicycle",
                    isSelected: deliveryMethod == 1,
                    onTap: { deliveryMethod = 1 }
                )
            }

            if deliveryMethod == 1 {
                Text("Nhận tận nơi chưa vận hành: đơn vẫn được lưu và kho duyệt, nhưng chưa có người đến lấy đồ.")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.85, green: 0.45, blue: 0.10))
            }
        }
    }

    private func deliveryOptionCard(title: String, subtitle: String, icon: String, isSelected: Bool, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(isSelected ? primaryGreen : textMuted)

                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(textDark)

                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(textMuted)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? primaryGreen : cardBorderColor, lineWidth: isSelected ? 2 : 1)
            )
        }
    }

    // MARK: - 5. Nút Hoàn tất
    private var submitDonationButton: some View {
        Button(action: submitDonation) {
            HStack(spacing: 8) {
                if isSubmitting {
                    ProgressView().tint(.white)
                    Text(submitStatus ?? "Đang lưu đơn...")
                        .font(.system(size: 15, weight: .semibold))
                } else {
                    // Đơn luôn được lưu thật và kho duyệt; chỉ điểm tiếp nhận có thể đang minh hoạ (đã ghi rõ ở trên).
                    Text("Gửi đơn quyên góp")
                        .font(.system(size: 16, weight: .bold))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(Color(red: 0.11, green: 0.35, blue: 0.20))
            .foregroundColor(.white)
            .cornerRadius(16)
            .shadow(color: Color(red: 0.11, green: 0.35, blue: 0.20).opacity(0.3), radius: 8, y: 4)
        }
        .disabled(isSubmitting || selectedHub == nil)
    }

    private var declaredQuantity: Double? {
        let input = quantityText.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        return DonationQuantity.amount(input, unitId: selectedUnit.rawValue)
    }

    // MARK: - Logic gửi đơn quyên góp 2 bước (Storage -> Firestore) với cơ chế phục hồi
    private func submitDonation() {
        guard (3...6).contains(capturedImages.count),
              !itemTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let quantity = declaredQuantity,
              didConfirmCategory else {
            self.errorMessage = "Vui lòng chọn 3–6 ảnh, nhập tên và xác nhận danh mục. Số đếm phải nguyên dương; kg tối đa 3 số lẻ."
            self.showErrorAlert = true
            return
        }
        guard let currentUserId = AuthService.shared.currentUserId else {
            self.errorMessage = "Bạn cần đăng nhập tài khoản trước khi gửi quyên góp."
            self.showErrorAlert = true
            return
        }
        guard let selectedHub else {
            self.errorMessage = "Chưa có điểm tiếp nhận để gửi đơn. Vui lòng thử lại sau."
            self.showErrorAlert = true
            return
        }
        if let campaign {
            guard campaign.isAcceptingDonations else {
                self.errorMessage = "Chiến dịch đã hết hạn nhận đơn. Bạn có thể quyên góp tự do thay thế."
                self.showErrorAlert = true
                return
            }
            guard selectedCategory == campaign.donationCategory else {
                self.errorMessage = "Chiến dịch này chỉ nhận \(campaign.categoryTitle.lowercased())."
                self.showErrorAlert = true
                return
            }
        }

        isSubmitting = true
        submitStatus = "Đang chuẩn bị ảnh..."
        let confirmedCategory = selectedCategory
        let submittedPrediction = aiPrediction
        let deliveryText = deliveryMethod == 0 ? "drop_off" : "pickup"

        Task {
            // Bước 1: Upload ảnh Cloudinary có chữ ký (nếu chưa upload trước đó)
            var finalAssets = uploadedImageAssets
            if finalAssets.isEmpty && !capturedImages.isEmpty {
                let uploadStartedAt = Date()
                do {
                    print("📤 [Cloudinary] Đang tải \(capturedImages.count) ảnh quyên góp...")
                    finalAssets = try await CloudinaryImageService.shared.uploadImages(
                        capturedImages,
                        purpose: .donation,
                        recordId: donationDocumentId,
                        maxPixelDimension: 2048,
                        onProgress: { completed, total in
                            submitStatus = "Đang tải ảnh \(completed)/\(total)..."
                        }
                    )
                    await MainActor.run {
                        self.uploadedImageAssets = finalAssets
                    }
                    print("✅ [Cloudinary] Đã tải \(finalAssets.count) ảnh quyên góp.")
                    print("⏱️ [Donation] Tải ảnh: \(Int(Date().timeIntervalSince(uploadStartedAt).rounded())) giây")
                } catch {
                    print("❌ [Cloudinary] Tải ảnh thất bại: \(error.localizedDescription)")
                    print("⏱️ [Donation] Tải ảnh thất bại sau \(Int(Date().timeIntervalSince(uploadStartedAt).rounded())) giây")
                    await MainActor.run {
                        self.errorMessage = storageErrorMessage(error)
                        self.showErrorAlert = true
                        self.isSubmitting = false
                        self.submitStatus = nil
                    }
                    return
                }
            }

            // Bước 2: Chỉ lưu public ID của ảnh bảo vệ; backend kiểm tra quyền trước khi cấp URL xem.
            // Tái sử dụng donationDocumentId để đảm bảo idempotent khi thử lại.
            let newItem = DonationItem(
                id: donationDocumentId,
                donorId: currentUserId,
                title: itemTitle,
                description: notes.isEmpty ? defaultDescription(hub: selectedHub) : notes,
                category: confirmedCategory,
                condition: selectedCondition,
                status: .pending,
                imageUrl: nil,
                images: nil,
                imageProvider: "cloudinary",
                imagePublicIds: finalAssets.map(\.publicId),
                createdAt: Date(),
                statusNote: deliveryText == "pickup"
                    ? "Chờ kho duyệt; nhận tận nơi chưa vận hành nên chưa có người đến lấy."
                    : selectedHub.isDemo
                        ? "Chờ kho duyệt; điểm \(selectedHub.name) đang minh hoạ nên chưa mang đồ tới điểm này."
                        : "Chờ kho duyệt; mang đồ tới điểm \(selectedHub.name) sau khi đơn được duyệt.",
                campaignId: campaign?.id,
                hubId: selectedHub.id,
                deliveryMethod: deliveryText,
                confirmationCode: confirmationCode,
                quantity: quantity,
                unitId: selectedUnit.rawValue,
                aiPredictedCategory: submittedPrediction?.category,
                aiConfidence: submittedPrediction?.confidence,
                aiModelVersion: submittedPrediction == nil ? nil : CatalogCategoryClassifier.modelVersion,
                donorConfirmedCategory: confirmedCategory
            )

            await MainActor.run { self.submitStatus = "Đang lưu đơn..." }
            let firestoreStartedAt = Date()
            do {
                print("🚀 [Firestore] Đang ghi đơn quyên góp vào collection 'donations'...")
                try await FirestoreService.shared.createDonation(newItem)
                print("✅ [Firestore] Đơn quyên góp đã được ghi thành công vào Cloud Firestore!")
                print("⏱️ [Donation] Ghi đơn: \(Int(Date().timeIntervalSince(firestoreStartedAt).rounded())) giây")

                await MainActor.run {
                    self.submittedItem = newItem
                    self.isSubmitting = false
                    self.submitStatus = nil
                    self.navigateToSuccess = true
                }
            } catch {
                print("❌ [Firestore] Ghi đơn quyên góp thất bại: \(error.localizedDescription)")
                print("⏱️ [Donation] Ghi đơn thất bại sau \(Int(Date().timeIntervalSince(firestoreStartedAt).rounded())) giây")
                await MainActor.run {
                    let nsError = error as NSError
                    if campaign != nil, nsError.domain == "FIRFirestoreErrorDomain", nsError.code == 7 {
                        // Rules từ chối: chiến dịch vừa đóng/hết hạn hoặc danh mục không khớp.
                        self.errorMessage = "Chiến dịch có thể vừa đóng hoặc hết hạn nên không nhận đơn mới. Ảnh đã tải lên; bạn có thể huỷ đơn hoặc quyên góp tự do."
                    } else {
                        self.errorMessage = "Không thể tạo đơn quyên góp: \(error.localizedDescription). Ảnh của bạn đã được tải lên và sẵn sàng thử lại."
                    }
                    self.showErrorAlert = true
                    self.isSubmitting = false
                    self.submitStatus = nil
                }
            }
        }
    }

    private func defaultDescription(hub: ReShareHub) -> String {
        if let campaign { return "Quyên góp cho chiến dịch \(campaign.title)" }
        return "Quyên góp tại điểm \(hub.name)"
    }

    /// Hub đang hoạt động từ Firestore; có chiến dịch thì chỉ giữ Hub của chiến dịch.
    private func loadHubs() async {
        isLoadingHubs = true
        do {
            let records = try await FirestoreService.shared.fetchActiveHubs()
            let allowed = campaign.map { Set($0.hubIds) }
            daNangHubs = records
                .filter { allowed?.contains($0.id) ?? true }
                .map(ReShareHub.init(record:))
            hubsLoadFailed = false
            selectedHubIndex = 0
            if let first = daNangHubs.first {
                mapRegion.center = first.coordinate
            }
        } catch {
            hubsLoadFailed = true
        }
        isLoadingHubs = false
    }

    private func campaignBanner(_ campaign: DonationCampaign) -> some View {
        HStack(spacing: 10) {
            Image(systemName: campaign.imageSystemName)
                .font(.system(size: 18))
                .foregroundColor(primaryGreen)
            VStack(alignment: .leading, spacing: 2) {
                Text("Quyên góp cho chiến dịch")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(textMuted)
                Text(campaign.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(textDark)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(12)
        .background(primaryGreen.opacity(0.08))
        .cornerRadius(12)
    }

    private func storageErrorMessage(_ error: Error) -> String {
        if let cloudinaryError = error as? CloudinaryImageError {
            return cloudinaryError.localizedDescription
        }
        if (error as NSError).domain == NSURLErrorDomain {
            return "Không thể kết nối dịch vụ ảnh. Vui lòng kiểm tra mạng và thử lại."
        }
        return "Không thể chuẩn bị hoặc tải ảnh lên. Vui lòng thử lại."
    }

    private func classifyFirstPhoto() {
        guard !didClassify, !isClassifying, let image = capturedImages.first else { return }
        isClassifying = true
        CatalogCategoryClassifier.predict(from: image) { prediction in
            aiPrediction = prediction
            isClassifying = false
            didClassify = true
            // Có chiến dịch thì danh mục đã khoá theo chiến dịch, AI chỉ để cảnh báo nếu lệch.
            if let prediction, prediction.confidence >= 0.6, !didConfirmCategory, campaign == nil {
                selectedCategory = prediction.category
            }
            if let prediction {
                print("[Core ML] \(CatalogCategoryClassifier.modelVersion): \(Int(prediction.durationMs.rounded())) ms")
            }
        }
    }
}

#Preview {
    NavigationStack {
        DonationDetailsView()
    }
}
