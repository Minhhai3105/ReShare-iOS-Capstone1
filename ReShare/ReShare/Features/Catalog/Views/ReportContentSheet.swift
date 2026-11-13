import SwiftUI

/// Màn gửi báo cáo vi phạm cho bài đăng, tin nhắn hoặc người dùng (App Store Guideline 1.2).
struct ReportContentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let report: ContentReport

    @State private var reason: ContentReport.Reason = .inappropriate
    @State private var note = ""
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var didSend = false

    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)

    var body: some View {
        NavigationStack {
            Form {
                if didSend {
                    Section {
                        Label("Đã gửi báo cáo", systemImage: "checkmark.seal.fill")
                            .foregroundColor(primaryGreen)
                            .font(.system(size: 16, weight: .semibold))
                        Text("Cảm ơn bạn. ReShare sẽ xem xét trong vòng 24 giờ. Bạn cũng có thể chặn người này để không nhận tin nhắn hay thấy bài của họ nữa.")
                            .font(.system(size: 14))
                    }
                } else {
                    Section("Lý do") {
                        Picker("Lý do", selection: $reason) {
                            ForEach(ContentReport.Reason.allCases) { item in
                                Text(item.title).tag(item)
                            }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    Section {
                        TextField("Mô tả thêm (không bắt buộc)", text: $note, axis: .vertical)
                            .lineLimit(3...6)
                            .onChange(of: note) { _, value in
                                if value.count > 500 { note = String(value.prefix(500)) }
                            }
                    } footer: {
                        Text("Báo cáo được gửi kín danh tới đội ngũ ReShare, người bị báo cáo không biết ai đã báo cáo.")
                    }
                    if let errorMessage {
                        Section { Text(errorMessage).foregroundColor(.red).font(.system(size: 14)) }
                    }
                }
            }
            .navigationTitle(report.subject)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(didSend ? "Đóng" : "Huỷ") { dismiss() }
                        .disabled(isSending)
                }
                if !didSend {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(isSending ? "Đang gửi…" : "Gửi") { send() }
                            .disabled(isSending)
                    }
                }
            }
        }
    }

    private func send() {
        isSending = true
        errorMessage = nil
        Task {
            do {
                try await FirestoreService.shared.submitReport(report, reason: reason, note: note)
                didSend = true
            } catch {
                errorMessage = "Chưa gửi được báo cáo. Kiểm tra kết nối rồi thử lại."
            }
            isSending = false
        }
    }
}
