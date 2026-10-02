import AVFoundation
import Combine
import SwiftUI

enum DonationCameraStatus: Equatable {
    case idle
    case starting
    case ready
    case unavailable(String)
}

/// Giữ mọi thao tác cấu hình và chạy AVCaptureSession trên cùng một hàng đợi để không chặn UI.
final class DonationCameraController: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    @Published private(set) var status: DonationCameraStatus = .idle
    @Published private(set) var availableZoomFactors: [Double] = [1]
    @Published private(set) var selectedZoomFactor: Double = 1
    @Published private(set) var isFrontCamera = false
    @Published private(set) var supportsFlash = false
    @Published private(set) var isCapturing = false
    @Published var captureError: String?
    var onPhotoCaptured: ((UIImage) -> Void)?

    private let sessionQueue = DispatchQueue(label: "ReShare.DonationCamera.session")
    private let photoOutput = AVCapturePhotoOutput()
    private var currentInput: AVCaptureDeviceInput?
    private var isConfigured = false
    private var isActive = false

    func start() {
        isActive = true
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            status = .unavailable("Thiết bị này không có camera. Bạn có thể chọn ảnh từ Kho ảnh.")
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startAuthorizedSession()
        case .notDetermined:
            status = .starting
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self, self.isActive else { return }
                    if granted {
                        self.startAuthorizedSession()
                    } else {
                        self.status = .unavailable("ReShare chưa được cấp quyền Camera. Hãy bật quyền trong Cài đặt hoặc chọn ảnh từ Kho ảnh.")
                    }
                }
            }
        case .denied, .restricted:
            status = .unavailable("ReShare chưa được cấp quyền Camera. Hãy bật quyền trong Cài đặt hoặc chọn ảnh từ Kho ảnh.")
        @unknown default:
            status = .unavailable("Không thể truy cập Camera. Bạn có thể chọn ảnh từ Kho ảnh.")
        }
    }

    func stop() {
        isActive = false
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    private func startAuthorizedSession() {
        status = .starting
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if !self.isConfigured, let error = self.configureSession() {
                DispatchQueue.main.async { self.status = .unavailable(error) }
                return
            }
            if !self.session.isRunning {
                self.session.startRunning()
            }
            let isRunning = self.session.isRunning
            DispatchQueue.main.async {
                guard self.isActive else { return }
                self.status = isRunning ? .ready : .unavailable("Không thể khởi động Camera. Hãy thử mở lại màn hình.")
            }
        }
    }

    private func configureSession() -> String? {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else {
            return "Không tìm thấy camera sau trên thiết bị."
        }

        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(photoOutput) else {
            session.commitConfiguration()
            return "Không thể cấu hình Camera trên thiết bị này."
        }
        session.addInput(input)
        session.addOutput(photoOutput)
        session.commitConfiguration()
        currentInput = input
        isConfigured = true
        publishCapabilities(for: device, zoom: 1)
        return nil
    }

    func capturePhoto(flash: Bool) {
        guard status == .ready, !isCapturing else { return }
        isCapturing = true
        captureError = nil
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else {
                DispatchQueue.main.async { self?.isCapturing = false }
                return
            }
            let settings = AVCapturePhotoSettings()
            if flash && self.currentInput?.device.hasFlash == true && self.photoOutput.supportedFlashModes.contains(.on) {
                settings.flashMode = .on
            }
            if let connection = self.photoOutput.connection(with: .video), connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        DispatchQueue.main.async {
            self.isCapturing = false
            if let image, error == nil {
                self.onPhotoCaptured?(image)
            } else {
                self.captureError = error?.localizedDescription ?? "Không thể lưu ảnh vừa chụp. Vui lòng thử lại."
            }
        }
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings, error: Error?) {
        guard let error else { return }
        DispatchQueue.main.async {
            self.isCapturing = false
            self.captureError = error.localizedDescription
        }
    }

    func switchCamera() {
        guard status == .ready, !isCapturing else { return }
        sessionQueue.async { [weak self] in
            guard let self, let currentInput = self.currentInput else { return }
            let position: AVCaptureDevice.Position = currentInput.device.position == .back ? .front : .back
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
                  self.replaceInput(with: device) else { return }
            if (try? device.lockForConfiguration()) != nil {
                device.videoZoomFactor = max(1, device.minAvailableVideoZoomFactor)
                device.unlockForConfiguration()
            }
            self.publishCapabilities(for: device, zoom: 1)
        }
    }

    func setZoomFactor(_ factor: Double) {
        guard status == .ready, !isCapturing, availableZoomFactors.contains(factor) else { return }
        sessionQueue.async { [weak self] in
            guard let self, let currentInput = self.currentInput else { return }
            let position = currentInput.device.position
            let deviceType: AVCaptureDevice.DeviceType = factor == 0.5 ? .builtInUltraWideCamera : .builtInWideAngleCamera
            guard let device = AVCaptureDevice.default(deviceType, for: .video, position: position),
                  self.replaceInput(with: device) else { return }
            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = min(max(CGFloat(factor < 1 ? 1 : factor), device.minAvailableVideoZoomFactor), device.maxAvailableVideoZoomFactor)
                device.unlockForConfiguration()
                self.publishCapabilities(for: device, zoom: factor)
            } catch {
                DispatchQueue.main.async { self.captureError = "Không thể thay đổi mức zoom. Vui lòng thử lại." }
            }
        }
    }

    /// Thay input trong một lần cấu hình; nếu thất bại phải trả lại camera cũ.
    private func replaceInput(with device: AVCaptureDevice) -> Bool {
        guard let oldInput = currentInput else { return false }
        if oldInput.device.uniqueID == device.uniqueID { return true }
        guard let newInput = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        session.removeInput(oldInput)
        if session.canAddInput(newInput) {
            session.addInput(newInput)
            currentInput = newInput
        } else {
            session.addInput(oldInput)
        }
        session.commitConfiguration()
        return currentInput === newInput
    }

    private func publishCapabilities(for device: AVCaptureDevice, zoom: Double) {
        let isFront = device.position == .front
        let wideCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: device.position)
        var factors: [Double] = [1]
        if !isFront && AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil {
            factors.insert(0.5, at: 0)
        }
        if let wideCamera, wideCamera.maxAvailableVideoZoomFactor >= 2 {
            factors.append(2)
        }
        let flashAvailable = device.hasFlash && photoOutput.supportedFlashModes.contains(.on)
        DispatchQueue.main.async {
            self.availableZoomFactors = factors
            self.selectedZoomFactor = zoom
            self.isFrontCamera = isFront
            self.supportsFlash = flashAvailable
        }
    }
}

final class DonationCameraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

struct DonationCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> DonationCameraPreviewUIView {
        let view = DonationCameraPreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        updateUIView(view, context: context)
        return view
    }

    func updateUIView(_ uiView: DonationCameraPreviewUIView, context: Context) {
        if let connection = uiView.previewLayer.connection, connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }
}
