import SwiftUI
import MapKit

// MARK: - Model Trạm Tiếp Nhận ReShare Hub tại Đà Nẵng
struct ReShareHub: Identifiable {
    let id: String
    let name: String
    let address: String
    let coordinate: CLLocationCoordinate2D
    let openHours: String
}

/// Màn hình BƯỚC 2: Nhập thông tin chi tiết & Chọn Trạm ReShare Hub tại Đà Nẵng
struct DonationDetailsView: View {
    @Environment(\.dismiss) private var dismiss

    // Nhận mảng 3 - 6 ảnh vừa chụp từ Camera
    var capturedImages: [UIImage] = []
    var campaignId: String? = nil
    var onBackToHome: (() -> Void)? = nil

    // MARK: - Ba điểm minh hoạ chưa hoạt động tại TP. Đà Nẵng
    private let daNangHubs: [ReShareHub] = [
        ReShareHub(
            id: "hub-haichau",
            name: "Hải Châu",
            address: "Vị trí minh hoạ tại quận Hải Châu",
            coordinate: CLLocationCoordinate2D(latitude: 16.0678, longitude: 108.2208),
            openHours: "Chưa hoạt động"
        ),
        ReShareHub(
            id: "hub-nguhanhson",
            name: "Ngũ Hành Sơn",
            address: "Vị trí minh hoạ tại quận Ngũ Hành Sơn",
            coordinate: CLLocationCoordinate2D(latitude: 16.0350, longitude: 108.2435),
            openHours: "Chưa hoạt động"
        ),
        ReShareHub(
            id: "hub-lienchieu",
            name: "Liên Chiểu",
            address: "Vị trí minh hoạ tại quận Liên Chiểu",
            coordinate: CLLocationCoordinate2D(latitude: 16.0748, longitude: 108.1528),
            openHours: "Chưa hoạt động"
        )
    ]

    // MARK: - State dữ liệu
    @State private var itemTitle: String = ""
    @State private var selectedCategory: DonationCategory = .clothing
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
    @State private var donationDocumentId: String = UUID().uuidString
    @State private var confirmationCode: String = "#DEMO-\(Calendar.current.component(.year, from: Date()))-\(Int.random(in: 1000...9999))"
    @State private var submittedItem: DonationItem? = nil
    @State private var uploadedImageAssets: [CloudinaryUploadedImage] = []
    @State private var errorMessage: String? = nil
    @State private var showErrorAlert: Bool = false

    // Custom Binding an toàn giúp cập nhật tâm bản đồ khi đổi Trạm
    private var selectedHubBinding: Binding<Int> {
        Binding(
            get: { selectedHubIndex },
            set: { newIndex in
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
                confirmationCode: confirmationCode,
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
                    Picker("Danh mục", selection: $selectedCategory) {
                        ForEach(DonationCategory.allCases) { cat in
                            Text(cat.title).tag(cat)
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
            Text("ĐIỂM TIẾP NHẬN MẪU (CHƯA HOẠT ĐỘNG)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            Text("Đây là luồng thử nghiệm. Không mang đồ tới vị trí trên bản đồ hoặc hẹn người đến nhận.")
                .font(.system(size: 12))
                .foregroundColor(Color(red: 0.85, green: 0.45, blue: 0.10))

            // Picker chọn Trạm Đà Nẵng
            Picker("Trạm", selection: selectedHubBinding) {
                ForEach(0..<daNangHubs.count, id: \.self) { i in
                    Text(daNangHubs[i].name).tag(i)
                }
            }
            .pickerStyle(.segmented)

            // Bản đồ MapKit hiển thị vị trí Trạm
            Map(coordinateRegion: $mapRegion, annotationItems: [daNangHubs[selectedHubIndex]]) { hub in
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
                    Text(daNangHubs[selectedHubIndex].address)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(textDark)
                    Text("⏰ \(daNangHubs[selectedHubIndex].openHours)")
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
                deliveryOptionCard(
                    title: "Mô phỏng gửi tại điểm",
                    subtitle: "Chưa nhận đồ thật",
                    icon: "figure.walk",
                    isSelected: deliveryMethod == 0,
                    onTap: { deliveryMethod = 0 }
                )

                deliveryOptionCard(
                    title: "Mô phỏng nhận tận nơi",
                    subtitle: "Chưa có người đến lấy",
                    icon: "bicycle",
                    isSelected: deliveryMethod == 1,
                    onTap: { deliveryMethod = 1 }
                )
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
                } else {
                    Text("Lưu đơn thử nghiệm")
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
        .disabled(isSubmitting || itemTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || capturedImages.count < 3)
    }

    // MARK: - Logic gửi đơn quyên góp 2 bước (Storage -> Firestore) với cơ chế phục hồi
    private func submitDonation() {
        guard capturedImages.count >= 3, !itemTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            self.errorMessage = "Vui lòng chụp ít nhất 3 ảnh và nhập tên món đồ."
            self.showErrorAlert = true
            return
        }
        guard let currentUserId = AuthService.shared.currentUserId else {
            self.errorMessage = "Bạn cần đăng nhập tài khoản trước khi gửi quyên góp."
            self.showErrorAlert = true
            return
        }

        isSubmitting = true
        let selectedHub = daNangHubs[selectedHubIndex]
        let deliveryText = deliveryMethod == 0 ? "drop_off" : "pickup"

        Task {
            // Bước 1: Upload ảnh Cloudinary có chữ ký (nếu chưa upload trước đó)
            var finalAssets = uploadedImageAssets
            if finalAssets.isEmpty && !capturedImages.isEmpty {
                do {
                    print("📤 [Cloudinary] Đang tải \(capturedImages.count) ảnh quyên góp...")
                    finalAssets = try await CloudinaryImageService.shared.uploadImages(
                        capturedImages,
                        purpose: .donation,
                        recordId: donationDocumentId
                    )
                    await MainActor.run {
                        self.uploadedImageAssets = finalAssets
                    }
                    print("✅ [Cloudinary] Đã tải \(finalAssets.count) ảnh quyên góp.")
                } catch {
                    print("❌ [Cloudinary] Tải ảnh thất bại: \(error.localizedDescription)")
                    await MainActor.run {
                        self.errorMessage = storageErrorMessage(error)
                        self.showErrorAlert = true
                        self.isSubmitting = false
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
                description: notes.isEmpty ? "Đơn thử nghiệm tại điểm mẫu \(selectedHub.name)" : notes,
                category: selectedCategory,
                condition: selectedCondition,
                status: .pending,
                imageUrl: nil,
                images: nil,
                imageProvider: "cloudinary",
                imagePublicIds: finalAssets.map(\.publicId),
                createdAt: Date(),
                statusNote: "Đơn thử nghiệm; điểm \(selectedHub.name) chưa hoạt động và không tiếp nhận đồ thật.",
                campaignId: campaignId,
                hubId: selectedHub.id,
                deliveryMethod: deliveryText,
                confirmationCode: confirmationCode
            )

            do {
                print("🚀 [Firestore] Đang ghi đơn quyên góp vào collection 'donations'...")
                try await FirestoreService.shared.createDonation(newItem)
                print("✅ [Firestore] Đơn quyên góp đã được ghi thành công vào Cloud Firestore!")

                await MainActor.run {
                    self.submittedItem = newItem
                    self.isSubmitting = false
                    self.navigateToSuccess = true
                }
            } catch {
                print("❌ [Firestore] Ghi đơn quyên góp thất bại: \(error.localizedDescription)")
                await MainActor.run {
                    self.errorMessage = "Không thể tạo đơn quyên góp: \(error.localizedDescription). Ảnh của bạn đã được tải lên và sẵn sàng thử lại."
                    self.showErrorAlert = true
                    self.isSubmitting = false
                }
            }
        }
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
}

#Preview {
    NavigationStack {
        DonationDetailsView()
    }
}
