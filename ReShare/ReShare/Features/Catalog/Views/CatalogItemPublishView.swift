import SwiftUI

/// Màn hình Đăng đồ 0đ cộng đồng (P2P Trao tặng trực tiếp giữa người dân Đà Nẵng)
struct CatalogItemPublishView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    // Ảnh chụp thực tế từ Camera AI
    var capturedImages: [UIImage] = []
    var onPublished: ((CatalogItem) -> Void)? = nil
    var onBackToCatalog: (() -> Void)? = nil

    // Form fields
    @State private var itemTitle: String = ""
    @State private var selectedCategory: String = "Quần áo"
    @State private var selectedCondition: String = "Còn rất mới (95%)"
    @State private var selectedDistrict: String = "Hải Châu"
    @State private var pickupAddress: String = ""
    @State private var donorNote: String = ""
    @State private var selectedIcon: String = "tshirt.fill"

    @State private var isPublishing: Bool = false
    @State private var errorMessage: String? = nil
    @State private var itemDocumentId: String = "cat_\(UUID().uuidString.lowercased())"
    @State private var uploadedImageAssets: [CloudinaryUploadedImage] = []

    // Màu sắc ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let mintGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    private let textDark = Color(red: 0.11, green: 0.15, blue: 0.13)
    private let textMuted = Color(red: 0.40, green: 0.46, blue: 0.42)
    private let sectionHeaderColor = Color(red: 0.32, green: 0.40, blue: 0.36)
    private let cardBorderColor = Color.black.opacity(0.08)

    // Tùy chọn danh mục & quận Đà Nẵng
    private let categories = [
        ("Quần áo", "tshirt.fill"),
        ("Sách vở", "book.closed.fill"),
        ("Gia dụng", "cup.and.saucer.fill"),
        ("Mẹ & Bé", "teddybear.fill"),
        ("Đồ điện tử", "laptopcomputer")
    ]

    private let conditions = [
        "Mới nguyên hộp",
        "Còn rất mới (95%)",
        "Còn tốt",
        "Dùng ổn"
    ]

    private let daNangDistricts = [
        "Hải Châu", "Sơn Trà", "Ngũ Hành Sơn", "Thanh Khê", "Cẩm Lệ", "Liên Chiểu"
    ]

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 20) {
                // 1. Dải ảnh thực tế vừa chụp từ Camera
                if !capturedImages.isEmpty {
                    capturedPhotosCarousel
                }

                // 2. Icon đại diện món đồ (nếu chưa có ảnh hoặc muốn chọn biểu tượng nhận diện)
                iconSelectorSection

                // 3. Tên món đồ & Danh mục
                basicInfoSection

                // 4. Tình trạng đồ
                conditionSection

                // 5. Địa chỉ hẹn nhận đồ tại Đà Nẵng
                locationSection

                // 6. Lời nhắn gửi người nhận
                donorNoteSection

                if let err = errorMessage {
                    Text(err)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }

                // 7. Nút Đăng đồ
                publishButton
                    .padding(.top, 10)
                    .padding(.bottom, 30)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
        .background(Color(red: 0.97, green: 0.98, blue: 0.96).ignoresSafeArea())
        .navigationTitle("Thông tin đồ 0đ")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.visible, for: .navigationBar)
        .preferredColorScheme(.light)
        .environment(\.colorScheme, .light)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .bold))
                        Text("Quay lại")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(primaryGreen)
                }
            }
        }
    }

    // MARK: - Dải ảnh thực tế từ Camera
    private var capturedPhotosCarousel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ẢNH CHỤP THỰC TẾ (\(capturedImages.count) TẤM)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(sectionHeaderColor)

                Spacer()

                Text("Ảnh dùng để đăng đồ")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(mintGreen)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<capturedImages.count, id: \.self) { idx in
                        Image(uiImage: capturedImages[idx])
                            .resizable()
                            .scaledToFill()
                            .frame(width: 84, height: 84)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(primaryGreen.opacity(0.35), lineWidth: 1.5)
                            )
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - 1. Icon Selector
    private var iconSelectorSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("BIỂU TƯỢNG MÓN ĐỒ")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            HStack(spacing: 14) {
                ForEach(categories, id: \.0) { cat in
                    Button(action: {
                        selectedCategory = cat.0
                        selectedIcon = cat.1
                    }) {
                        VStack(spacing: 6) {
                            ZStack {
                                Circle()
                                    .fill(selectedCategory == cat.0 ? primaryGreen : Color.white)
                                    .frame(width: 48, height: 48)
                                    .overlay(Circle().stroke(cardBorderColor, lineWidth: 1))
                                    .shadow(color: Color.black.opacity(0.06), radius: 4)

                                Image(systemName: cat.1)
                                    .font(.system(size: 20))
                                    .foregroundColor(selectedCategory == cat.0 ? .white : primaryGreen)
                            }

                            Text(cat.0)
                                .font(.system(size: 11, weight: selectedCategory == cat.0 ? .bold : .medium))
                                .foregroundColor(selectedCategory == cat.0 ? primaryGreen : textDark)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    // MARK: - 2. Basic Info
    private var basicInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("THÔNG TIN MÓN ĐỒ")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Tên món đồ")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(textDark)

                    TextField("vd: Áo khoác phao ấm, Bộ sách...", text: $itemTitle)
                        .foregroundColor(textDark)
                        .padding(.horizontal, 14)
                        .frame(height: 48)
                        .background(Color.white)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(cardBorderColor, lineWidth: 1)
                        )
                }
            }
        }
    }

    // MARK: - 3. Condition
    private var conditionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TÌNH TRẠNG SỬ DỤNG")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(conditions, id: \.self) { cond in
                        Button(action: { selectedCondition = cond }) {
                            Text(cond)
                                .font(.system(size: 13, weight: selectedCondition == cond ? .bold : .medium))
                                .foregroundColor(selectedCondition == cond ? .white : textDark)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule().fill(selectedCondition == cond ? primaryGreen : Color.white)
                                )
                                .overlay(
                                    Capsule().stroke(selectedCondition == cond ? primaryGreen : cardBorderColor, lineWidth: 1)
                                )
                                .shadow(color: Color.black.opacity(0.04), radius: 3)
                        }
                    }
                }
            }
        }
    }

    // MARK: - 4. Location
    private var locationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ĐỊA ĐIỂM HẸN NHẬN ĐỒ TẠI ĐÀ NẴNG")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            VStack(spacing: 10) {
                HStack {
                    Text("Quận tại Đà Nẵng")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(textDark)
                    Spacer()
                    Picker("Quận", selection: $selectedDistrict) {
                        ForEach(daNangDistricts, id: \.self) { dist in
                            Text(dist).tag(dist)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(primaryGreen)
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color.white)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(cardBorderColor, lineWidth: 1)
                )

                VStack(alignment: .leading, spacing: 6) {
                    Text("Địa chỉ hẹn cụ thể")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(textDark)

                    TextField("vd: Gần Chợ Mới, Đường Lê Duẩn...", text: $pickupAddress)
                        .foregroundColor(textDark)
                        .padding(.horizontal, 14)
                        .frame(height: 48)
                        .background(Color.white)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(cardBorderColor, lineWidth: 1)
                        )
                }
            }
        }
    }

    // MARK: - 5. Donor Note
    private var donorNoteSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LỜI NHẮN CỦA BẠN CHO NGƯỜI NHẬN")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(sectionHeaderColor)

            TextEditor(text: $donorNote)
                .foregroundColor(textDark)
                .frame(height: 90)
                .padding(8)
                .background(Color.white)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(cardBorderColor, lineWidth: 1)
                )
        }
    }

    // MARK: - 6. Publish Button
    private var publishButton: some View {
        Button(action: handlePublish) {
            HStack(spacing: 8) {
                if isPublishing {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 16, weight: .bold))
                    Text("Đăng lên Kho đồ 0đ")
                        .font(.system(size: 16, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(primaryGreen)
            .foregroundColor(.white)
            .cornerRadius(16)
            .shadow(color: primaryGreen.opacity(0.3), radius: 8, y: 4)
        }
        .disabled(isPublishing || itemTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !(3...6).contains(capturedImages.count))
    }

    private func handlePublish() {
        guard !itemTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Vui lòng nhập tên món đồ"
            return
        }
        guard (3...6).contains(capturedImages.count) else {
            errorMessage = "Vui lòng chụp hoặc chọn từ 3 đến 6 ảnh thật của món đồ."
            return
        }
        guard let donorId = AuthService.shared.currentUserId, !donorId.isEmpty else {
            errorMessage = "Bạn cần đăng nhập lại trước khi đăng đồ."
            return
        }

        isPublishing = true
        errorMessage = nil

        let donorName = appState.currentUserProfile?.displayName ?? "Người dân Đà Nẵng"

        Task {
            do {
                // Dùng lại ảnh và ID khi thử lại sau lỗi ghi Firestore.
                let uploadedAssets: [CloudinaryUploadedImage]
                if uploadedImageAssets.count == capturedImages.count {
                    uploadedAssets = uploadedImageAssets
                } else {
                    uploadedAssets = try await CloudinaryImageService.shared.uploadImages(
                        capturedImages,
                        purpose: .catalogItem,
                        recordId: itemDocumentId
                    )
                    await MainActor.run { uploadedImageAssets = uploadedAssets }
                }
                let imageUrls = uploadedAssets.compactMap(\.secureURL)
                guard imageUrls.count == capturedImages.count else {
                    throw CloudinaryImageError.invalidServerResponse
                }

                let newItem = CatalogItem(
                    id: itemDocumentId,
                    donorId: donorId,
                    donorName: donorName,
                    title: itemTitle.trimmingCharacters(in: .whitespaces),
                    category: selectedCategory,
                    condition: selectedCondition,
                    district: selectedDistrict,
                    timeAgo: "Vừa xong",
                    imageName: selectedIcon,
                    status: .available,
                    pickupAddress: pickupAddress.isEmpty ? "Q. \(selectedDistrict), Đà Nẵng" : "\(pickupAddress), Q. \(selectedDistrict), Đà Nẵng",
                    donorNote: donorNote.isEmpty ? "Món đồ này mình không còn dùng tới nên muốn tặng lại cho ai cần. Các bạn nhắn tin hẹn trước nhé!" : donorNote,
                    createdAt: Date(),
                    imageUrl: imageUrls.first,
                    images: imageUrls,
                    imageProvider: "cloudinary",
                    imagePublicIds: uploadedAssets.map(\.publicId)
                )

                try await FirestoreService.shared.publishCatalogItem(newItem)

                await MainActor.run {
                    isPublishing = false
                    onPublished?(newItem)
                    if let onBackToCatalog = onBackToCatalog {
                        onBackToCatalog()
                    } else {
                        dismiss()
                    }
                }
            } catch {
                await MainActor.run {
                    isPublishing = false
                    errorMessage = "Không thể đăng đồ: \(error.localizedDescription). Bạn có thể thử lại; ảnh tải lên thành công sẽ được dùng lại."
                }
            }
        }
    }
}
