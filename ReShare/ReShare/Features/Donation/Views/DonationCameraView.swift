import SwiftUI
import AVFoundation

// MARK: - Chế độ chụp của Camera ReShare
enum CameraMode {
    case hubDonation // Quyên góp vào trạm Hub ReShare (Kênh 2)
    case communityCatalog // Đăng đồ lên Kho đồ 0đ cộng đồng P2P (Kênh 1)
}

/// Màn hình Camera Chụp & Kiểm định Đồ quyên góp (Hỗ trợ cả Quyên góp trạm & Đăng tặng Kho đồ 0đ)
struct DonationCameraView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    
    // Callback truyền danh sách ảnh sang bước xác nhận thông tin
    var onFinishCapturing: (([UIImage]) -> Void)?
    var onBackToHome: (() -> Void)? = nil
    
    // Chiến dịch tiếp nhận (nếu có)
    var campaignId: String? = nil
    
    // Chế độ hoạt động
    var mode: CameraMode = .hubDonation
    var onCatalogPublished: ((CatalogItem) -> Void)? = nil
    
    init(
        onFinishCapturing: (([UIImage]) -> Void)? = nil,
        onBackToHome: (() -> Void)? = nil,
        campaignId: String? = nil,
        mode: CameraMode = .hubDonation,
        onCatalogPublished: ((CatalogItem) -> Void)? = nil
    ) {
        self.onFinishCapturing = onFinishCapturing
        self.onBackToHome = onBackToHome
        self.campaignId = campaignId
        self.mode = mode
        self.onCatalogPublished = onCatalogPublished
    }
    
    // Điều hướng sang Bước 2:
    @State private var navigateToDetails: Bool = false
    @State private var navigateToCatalogPublish: Bool = false
    
    // Cả hai luồng đều cần đủ góc chụp để người xem kiểm tra món đồ.
    private let minPhotos = 3
    private let maxPhotos = 6
    
    // MARK: - State quản lý Camera & Danh sách ảnh đã chụp
    @StateObject private var camera = DonationCameraController()
    @State private var capturedImages: [UIImage] = []
    @State private var isFlashOn: Bool = false
    @State private var showImagePicker: Bool = false
    @State private var isCameraScreenVisible: Bool = false
    
    // Màu xanh chủ đạo của ReShare
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)
    private let accentGreen = Color(red: 0.20, green: 0.65, blue: 0.38)
    
    var body: some View {
        ZStack {
            // LỚP 1: Preview trực tiếp từ Camera trên thiết bị
            Color.black.ignoresSafeArea()
            DonationCameraPreview(session: camera.session)
                .ignoresSafeArea()

            // LỚP 2: Khung ngắm Viewfinder viền trắng thanh lịch
            cameraViewfinderSection

            if camera.status != .ready {
                cameraStatusOverlay
            }
            
            // LỚP 3: Giao diện điều khiển (HUD)
            VStack(spacing: 0) {
                // 1. Thanh điều hướng trên cùng (Close, Tiêu đề đếm ảnh, Flash)
                topNavigationBar
                    .padding(.top, 10)
                    .padding(.horizontal, 20)
                
                Spacer()
                
                // 2. Dòng hướng dẫn góc chụp thông minh
                guideInstructionBadge
                    .padding(.bottom, 12)
                
                // 3. Nút chọn mức Zoom chuẩn Apple (.5, 1x, 2)
                zoomSelectorBar
                    .padding(.bottom, 14)
                
                // 4. Dải ảnh thu nhỏ cuộn ngang (Hiển thị các ảnh đã chụp)
                if !capturedImages.isEmpty {
                    capturedThumbnailsScrollView
                        .padding(.bottom, 16)
                }
                
                // 5. Thanh nút điều khiển đáy màn hình (Kho ảnh, Nút Chụp, Nút Tiếp tục)
                bottomControlsBar
                    .padding(.horizontal, 28)
                    .padding(.bottom, 28)
            }
        }
        .onAppear {
            isCameraScreenVisible = true
            camera.onPhotoCaptured = { image in
                guard capturedImages.count < maxPhotos else { return }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    capturedImages.append(image)
                }
            }
            if scenePhase == .active { camera.start() }
        }
        .onDisappear {
            isCameraScreenVisible = false
            camera.stop()
            camera.onPhotoCaptured = nil
        }
        .onChange(of: scenePhase) { _, phase in
            if isCameraScreenVisible && phase == .active && !showImagePicker {
                camera.start()
            } else {
                camera.stop()
            }
        }
        .onChange(of: showImagePicker) { _, isShown in
            if isShown {
                camera.stop()
            } else if isCameraScreenVisible && scenePhase == .active {
                camera.start()
            }
        }
        .onChange(of: camera.supportsFlash) { _, supportsFlash in
            if !supportsFlash { isFlashOn = false }
        }
        .sheet(isPresented: $showImagePicker) {
            ImagePicker(selectedImage: Binding(
                get: { nil },
                set: { newImage in
                    if let img = newImage, capturedImages.count < maxPhotos {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            capturedImages.append(img)
                        }
                    }
                }
            ), sourceType: .photoLibrary)
        }
        .alert("Không thể chụp ảnh", isPresented: Binding(
            get: { camera.captureError != nil },
            set: { if !$0 { camera.captureError = nil } }
        )) {
            Button("Đóng", role: .cancel) { camera.captureError = nil }
        } message: {
            Text(camera.captureError ?? "")
        }
        .navigationDestination(isPresented: $navigateToDetails) {
            DonationDetailsView(
                capturedImages: capturedImages,
                campaignId: campaignId,
                onBackToHome: {
                    if let onBackToHome = onBackToHome {
                        onBackToHome()
                    } else {
                        dismiss()
                    }
                }
            )
        }
        .navigationDestination(isPresented: $navigateToCatalogPublish) {
            CatalogItemPublishView(
                capturedImages: capturedImages,
                onPublished: { item in
                    onCatalogPublished?(item)
                },
                onBackToCatalog: {
                    if let onBackToHome = onBackToHome {
                        onBackToHome()
                    } else {
                        dismiss()
                    }
                }
            )
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }
    
    // MARK: - 1. Trạng thái Camera khi chưa thể hiển thị preview
    private var cameraStatusOverlay: some View {
        VStack(spacing: 12) {
            if case .unavailable(let message) = camera.status {
                Image(systemName: "camera.slash")
                    .font(.system(size: 36))
                Text(message)
                    .multilineTextAlignment(.center)
            } else {
                ProgressView()
                    .tint(.white)
                Text("Đang mở Camera…")
            }
        }
        .font(.system(size: 15, weight: .medium))
        .foregroundColor(.white)
        .padding(24)
        .frame(maxWidth: 300)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(0.7)))
    }
    
    // MARK: - 2. Top Navigation Bar
    private var topNavigationBar: some View {
        HStack {
            // Nút đóng
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            
            Spacer()
            
            // Huy hiệu hiển thị tiến độ chụp ảnh
            HStack(spacing: 6) {
                Circle()
                    .fill(capturedImages.count >= minPhotos ? accentGreen : Color.yellow)
                    .frame(width: 7, height: 7)
                
                Text("\(capturedImages.count)/\(maxPhotos) Ảnh")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                
                if capturedImages.count < minPhotos {
                    Text("(Tối thiểu \(minPhotos))")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(Capsule().fill(Color.black.opacity(0.55)))
            .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            
            Spacer()
            
            // Nút Flash
            Button(action: { isFlashOn.toggle() }) {
                Image(systemName: isFlashOn ? "bolt.fill" : "bolt.slash.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(isFlashOn ? .yellow : .white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            .disabled(!camera.supportsFlash)
            .opacity(camera.supportsFlash ? 1 : 0.4)
        }
    }
    
    // MARK: - 3. Khung ngắm Viewfinder viền trắng thanh mảnh
    private var cameraViewfinderSection: some View {
        GeometryReader { geo in
            let frameWidth = geo.size.width * 0.84
            let frameHeight = frameWidth * 1.15
            
            ZStack {
                CornerBracketsShape()
                    .stroke(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .frame(width: frameWidth, height: frameHeight)
                    .shadow(color: Color.black.opacity(0.3), radius: 6)
                
                // Tâm chữ thập định vị
                ZStack {
                    Rectangle()
                        .fill(Color.white.opacity(0.25))
                        .frame(width: 14, height: 1.5)
                    Rectangle()
                        .fill(Color.white.opacity(0.25))
                        .frame(width: 1.5, height: 14)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    // MARK: - 4. Hướng dẫn góc chụp theo tiến độ
    private var guideInstructionBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: capturedImages.count >= minPhotos ? "checkmark.circle.fill" : "camera.viewfinder")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(capturedImages.count >= minPhotos ? accentGreen : Color.yellow)
            
            Text(currentGuideMessage)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color.black.opacity(0.65)))
        .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
    }
    
    private var currentGuideMessage: String {
        switch capturedImages.count {
        case 0: return "Ảnh 1/3: Chụp mặt trước (Toàn cảnh món đồ)"
        case 1: return "Ảnh 2/3: Chụp mặt sau của món đồ"
        case 2: return "Ảnh 3/3: Chụp tem mác hoặc tình trạng món đồ"
        case 3..<maxPhotos: return "Đã đủ 3 ảnh! Chụp thêm góc lỗi (nếu có) hoặc Tiếp tục"
        default: return "Đã đạt tối đa 6 ảnh. Bấm Tiếp tục để điền thông tin"
        }
    }
    
    // MARK: - 5. Thanh chọn mức Zoom (.5 • 1x • 2) chuẩn Apple Camera
    private var zoomSelectorBar: some View {
        HStack(spacing: 6) {
            ForEach(camera.availableZoomFactors, id: \.self) { factor in
                Button(action: {
                    camera.setZoomFactor(factor)
                }) {
                    ZStack {
                        if camera.selectedZoomFactor == factor {
                            Circle()
                                .fill(Color.black.opacity(0.65))
                                .frame(width: 32, height: 32)
                                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
                        }
                        
                        Text(zoomTitle(for: factor))
                            .font(.system(size: camera.selectedZoomFactor == factor ? 12 : 11, weight: .bold))
                            .foregroundColor(camera.selectedZoomFactor == factor ? Color(red: 1.0, green: 0.84, blue: 0.0) : .white.opacity(0.85))
                    }
                    .frame(width: 34, height: 34)
                }
                .disabled(camera.status != .ready || camera.isCapturing)
            }
        }
        .padding(3)
        .background(Capsule().fill(Color.black.opacity(0.45)))
        .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 0.8))
    }
    
    private func zoomTitle(for factor: Double) -> String {
        if factor == 0.5 {
            return ".5"
        } else if factor == 1.0 {
            return "1x"
        } else {
            return "\(Int(factor))"
        }
    }
    
    // MARK: - 6. Dải ảnh thu nhỏ cuộn ngang (Đã bóc tách Subview)
    private var capturedThumbnailsScrollView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(0..<capturedImages.count, id: \.self) { index in
                    thumbnailCard(for: index)
                }
                
                // Ô chờ thêm ảnh tiếp theo nếu chưa đạt tối đa 6 tấm
                if capturedImages.count < maxPhotos {
                    addMorePlaceholderCard
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 6)
        }
    }
    
    // Subview 1: Thẻ ảnh đã chụp kèm nút xóa
    private func thumbnailCard(for index: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(uiImage: capturedImages[index])
                .resizable()
                .scaledToFill()
                .frame(width: 58, height: 58)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.35), lineWidth: 1.5)
                )
            
            // Nút Xóa ảnh
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    deleteImage(at: index)
                }
            }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.red)
                    .background(Circle().fill(Color.white).frame(width: 14, height: 14))
            }
            .offset(x: 5, y: -5)
        }
    }
    
    // Hàm xóa ảnh an toàn, trả về Void để compiler không bị phân vân kiểu
    private func deleteImage(at index: Int) {
        guard capturedImages.indices.contains(index) else { return }
        capturedImages.remove(at: index)
    }
    
    // Subview 2: Ô nét đứt chờ thêm ảnh (Dùng [4.0, 4.0] để chuẩn CGFloat)
    private var addMorePlaceholderCard: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [4.0, 4.0]))
                .frame(width: 58, height: 58)
            
            VStack(spacing: 2) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(Color.white.opacity(0.6))
                Text("Thêm")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color.white.opacity(0.6))
            }
        }
    }
    
    // MARK: - 7. Thanh điều khiển đáy màn hình
    private var bottomControlsBar: some View {
        HStack(alignment: .center) {
            // Nút Thư viện ảnh (Photo Library)
            Button(action: {
                showImagePicker = true
            }) {
                VStack(spacing: 5) {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.18))
                            .frame(width: 50, height: 50)
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                    }
                    Text("Kho ảnh")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
            .disabled(capturedImages.count >= maxPhotos)
            .opacity(capturedImages.count >= maxPhotos ? 0.4 : 1.0)
            
            Spacer()
            
            // Nút Chụp ảnh tròn to, lấy ảnh từ AVCapturePhotoOutput
            Button(action: {
                camera.capturePhoto(flash: isFlashOn)
            }) {
                ZStack {
                    Circle()
                        .stroke(Color.white, lineWidth: 4)
                        .frame(width: 78, height: 78)
                    
                    Circle()
                        .fill(capturedImages.count >= maxPhotos ? Color.gray : Color.white)
                        .frame(width: 62, height: 62)
                    
                    // Hiển thị số ảnh đã chụp ở giữa nút
                    Text("\(capturedImages.count)")
                        .font(.system(size: 18, weight: .black))
                        .foregroundColor(primaryGreen)
                }
            }
            .disabled(capturedImages.count >= maxPhotos || camera.status != .ready || camera.isCapturing)
            
            Spacer()
            
            // Giữ nút đổi chiều khả dụng cả khi đã đủ ảnh tối thiểu.
            Button(action: {
                isFlashOn = false
                camera.switchCamera()
            }) {
                VStack(spacing: 5) {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.18))
                            .frame(width: 50, height: 50)
                        Image(systemName: "camera.rotate")
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                    }
                    Text("Đổi chiều")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
            .disabled(camera.status != .ready || camera.isCapturing)
            .opacity(camera.status == .ready && !camera.isCapturing ? 1 : 0.4)

            if capturedImages.count >= minPhotos {
                Spacer()
                Button(action: finishCaptureFlow) {
                    VStack(spacing: 5) {
                        ZStack {
                            Circle()
                                .fill(accentGreen)
                                .frame(width: 50, height: 50)
                                .shadow(color: accentGreen.opacity(0.6), radius: 8)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                        }
                        Text("Tiếp tục")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .disabled(camera.isCapturing)
                .transition(.scale.combined(with: .opacity))
            }
        }
    }
    
    private func finishCaptureFlow() {
        guard capturedImages.count >= minPhotos, !camera.isCapturing else { return }
        if let onFinishCapturing = onFinishCapturing {
            onFinishCapturing(capturedImages)
        }
        if mode == .communityCatalog {
            navigateToCatalogPublish = true
        } else {
            navigateToDetails = true
        }
    }
    
}

#Preview {
    DonationCameraView()
}
