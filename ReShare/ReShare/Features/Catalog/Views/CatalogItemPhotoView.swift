import SwiftUI

/// Ảnh Storage cho bài mới; ảnh Base64 vẫn dùng được cho bài đăng cũ.
struct CatalogItemPhotoView: View {
    let urlString: String?
    let legacyBase64: String?
    let placeholderName: String

    var body: some View {
        if let urlString, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .empty:
                    ProgressView()
                case .failure:
                    fallback
                @unknown default:
                    fallback
                }
            }
        } else {
            fallback
        }
    }

    @ViewBuilder private var fallback: some View {
        if let legacyBase64,
           let data = Data(base64Encoded: legacyBase64),
           let image = UIImage(data: data) {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            Image(systemName: placeholderName)
                .resizable()
                .scaledToFit()
                .padding(36)
                .foregroundColor(Color(red: 0.25, green: 0.45, blue: 0.30))
        }
    }
}
