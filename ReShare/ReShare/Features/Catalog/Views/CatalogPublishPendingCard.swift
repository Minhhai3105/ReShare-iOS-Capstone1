import SwiftUI

struct CatalogPublishPendingCard: View {
    let job: CatalogPublishJob
    @ObservedObject var queue: CatalogPublishQueue
    @State private var thumbnail: UIImage?

    private var failed: Bool { job.state == .failed }
    private var label: String {
        if failed { return "Chưa đăng được" }
        return job.state == .published ? "Đã đăng" : "Đang đăng"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Group {
                if let thumbnail {
                    Image(uiImage: thumbnail).resizable().scaledToFill()
                } else {
                    Image(systemName: job.payload.imageName).resizable().scaledToFit().padding(16)
                }
            }
            .frame(width: 76, height: 86)
            .background(Color.green.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 6) {
                Text(job.payload.title)
                    .scaledFont(size: 14, weight: .bold)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if !failed && job.state != .published { ProgressView().controlSize(.small) }
                    Text(label).scaledFont(size: 12, weight: .semibold)
                }
                .foregroundColor(failed ? .orange : Color(red: 0.11, green: 0.35, blue: 0.20))

                if failed {
                    Text(job.errorMessage ?? "Bản chờ vẫn được giữ trên máy.")
                        .scaledFont(size: 11)
                        .foregroundColor(.secondary)
                    Button("Thử lại") { Task { await queue.retry(job.id) } }
                        .scaledFont(size: 13, weight: .semibold)
                        .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                        .frame(minHeight: 44)
                } else {
                    Text(job.state == .published ? "Đang cập nhật danh sách…" : "Đã tải \(job.completedImageCount)/\(job.imageClientIDs.count) ảnh. Bạn có thể tiếp tục dùng app.")
                        .scaledFont(size: 11)
                        .foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .task(id: job.id) {
            if let data = await queue.thumbnail(for: job) { thumbnail = UIImage(data: data) }
        }
    }
}
