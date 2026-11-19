import SwiftUI

struct CatalogPublishPendingCard: View {
    let job: CatalogPublishJob
    @ObservedObject var queue: CatalogPublishQueue
    @State private var thumbnail: UIImage?
    @State private var showCancellationConfirmation = false

    private var failed: Bool { job.state == .failed }
    private var cancelling: Bool { queue.cancellingIDs.contains(job.id) }
    private var label: String {
        if cancelling { return "Đang huỷ bản chờ" }
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
                    HStack(spacing: 16) {
                        if job.cancellationRequested != true {
                            Button("Thử lại") { Task { await queue.retry(job.id) } }
                                .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                        }
                        Button(role: .destructive) { showCancellationConfirmation = true } label: {
                            HStack(spacing: 6) {
                                if cancelling { ProgressView().controlSize(.small) }
                                Text(cancelling ? "Đang huỷ…" : "Huỷ bản chờ")
                            }
                        }
                    }
                    .scaledFont(size: 13, weight: .semibold)
                    .frame(minHeight: 44)
                    .disabled(cancelling)
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
        .confirmationDialog("Huỷ bản chờ này?", isPresented: $showCancellationConfirmation, titleVisibility: .visible) {
            Button("Huỷ bản chờ", role: .destructive) { Task { await queue.cancel(job.id) } }
            Button("Giữ bản chờ", role: .cancel) {}
        } message: {
            Text("Nội dung và ảnh của bản chờ sẽ bị xoá sau khi dọn ảnh trên máy chủ thành công.")
        }
        .task(id: job.id) {
            if let data = await queue.thumbnail(for: job) { thumbnail = UIImage(data: data) }
        }
    }
}
