import SwiftUI
import UIKit

/// Cầu nối UIKit UIImagePickerController sang SwiftUI
struct ImagePicker: UIViewControllerRepresentable {
    // TẠI SAO dùng @Binding?: Để truyền ảnh đã chụp ngược về View cha (Two-way binding)
    @Binding var selectedImage: UIImage?

    // Tùy chọn nguồn: .camera (Chụp ảnh) hoặc .photoLibrary (Chọn từ Album)
    var sourceType: UIImagePickerController.SourceType = .camera

    // Môi trường giúp đóng màn hình Picker khi chụp xong
    @Environment(\.dismiss) private var dismiss

    // MARK: - 1. Tạo UIKit Controller
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()

        // Kiểm tra an toàn: Nếu thiết bị không có Camera (như máy ảo Simulator), fallback về Thư viện ảnh
        if UIImagePickerController.isSourceTypeAvailable(sourceType) {
            picker.sourceType = sourceType
        } else {
            picker.sourceType = .photoLibrary
        }

        // Gán Coordinator làm Delegate nhận sự kiện chụp ảnh
        picker.delegate = context.coordinator
        return picker
    }

    // MARK: - 2. Cập nhật Controller (Không cần làm gì ở đây)
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    // MARK: - 3. Tạo Coordinator kết nối Delegate
    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    // MARK: - 4. Class Coordinator xử lý Delegate của UIKit
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker

        init(parent: ImagePicker) {
            self.parent = parent
        }

        // Gọi khi người dùng đã chụp hoặc chọn ảnh xong
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                self.parent.selectedImage = image
            }
            self.parent.dismiss()
        }

        // Gọi khi người dùng bấm nút Cancel (Hủy)
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            self.parent.dismiss()
        }
    }
}
