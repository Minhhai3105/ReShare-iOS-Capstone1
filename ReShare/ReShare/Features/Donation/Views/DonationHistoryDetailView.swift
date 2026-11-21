import SwiftUI

struct DonationHistoryDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let item: DonationItem
    let hubName: String
    let campaignTitle: String?

    private var confirmedCategory: DonationCategory { item.donorConfirmedCategory ?? item.category }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    photos
                    information
                    progress
                }
                .padding(20)
            }
            .background(AppColors.background)
            .navigationTitle("Chi tiết đơn quyên góp")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Đóng") { dismiss() } }
            }
        }
    }

    private var photos: some View {
        let publicIds = item.imageProvider == "cloudinary" ? (item.imagePublicIds ?? []) : []
        let imageURLs = (item.images ?? []).compactMap { $0.isEmpty ? nil : URL(string: $0) }
        let legacyURLs = imageURLs.isEmpty ? (item.imageUrl.flatMap(URL.init(string:)).map { [$0] } ?? []) : imageURLs
        return ScrollView(.horizontal) {
            LazyHStack(spacing: 10) {
                if !publicIds.isEmpty {
                    ForEach(Array(publicIds.enumerated()), id: \.offset) { index, publicId in
                        photo(url: nil, publicId: publicId, label: "Ảnh \(index + 1) của món đồ")
                    }
                } else if !legacyURLs.isEmpty {
                    ForEach(Array(legacyURLs.enumerated()), id: \.offset) { index, url in
                        photo(url: url, publicId: nil, label: "Ảnh \(index + 1) của món đồ")
                    }
                } else {
                    photo(url: nil, publicId: nil, label: "Chưa có ảnh món đồ")
                }
            }
        }
    }

    private var information: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(item.title).font(.title2.bold()).foregroundStyle(AppColors.textPrimary)
            Label(item.status.donorTitle(reviewState: item.reviewState), systemImage: item.status.donorIconName(reviewState: item.reviewState))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(item.status.color)
            if !item.description.isEmpty { Text(item.description).foregroundStyle(AppColors.textSecondary) }
            LabeledContent("Danh mục", value: confirmedCategory.title)
            LabeledContent("Tình trạng", value: item.condition.title)
            LabeledContent("Số lượng", value: item.declaredQuantityLabel)
            LabeledContent("Điểm tiếp nhận", value: hubName)
            if item.campaignId != nil {
                LabeledContent("Chiến dịch", value: campaignTitle ?? "Chưa có tên chiến dịch")
            }
            if let code = item.confirmationCode, !code.isEmpty {
                LabeledContent("Mã xác nhận", value: code)
            }
            if let category = item.aiPredictedCategory {
                let confidence = item.aiConfidence.map { $0.formatted(.percent.precision(.fractionLength(0))) }
                let suggestion = confidence.map { "\(category.title) (\($0))" } ?? category.title
                Text("AI gợi ý: \(suggestion). Bạn đã xác nhận: \(confirmedCategory.title).")
                    .font(.footnote)
                    .foregroundStyle(AppColors.textSecondary)
            }
            if let note = item.statusNote, item.status == .rejected || item.reviewState == "needs_information" {
                Label(item.status == .rejected ? "Lý do từ chối: \(note)" : "Yêu cầu bổ sung: \(note)",
                      systemImage: "exclamationmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(item.status == .rejected ? AppColors.rejected : AppColors.pending)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppColors.surfacePrimary, in: RoundedRectangle(cornerRadius: 18))
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("Tiến trình").font(.headline).foregroundStyle(AppColors.textPrimary)
            milestone("Gửi đơn", at: item.createdAt)
            if let resubmittedAt = item.resubmittedAt { milestone("Đã gửi thông tin bổ sung", at: resubmittedAt) }
            switch item.status {
            case .rejected:
                milestone("Từ chối", at: item.reviewedAt, icon: "xmark.circle", color: AppColors.rejected)
            case .cancelled:
                milestone("Đã huỷ", at: item.cancelledAt, icon: "xmark.circle", color: .secondary)
            default:
                let statuses: [DonationStatus] = [.pending, .approved, .received, .inStock, .distributed]
                let currentStep = statuses.firstIndex(of: item.status) ?? 0
                milestone("Đã duyệt", at: item.reviewedAt, completed: currentStep >= 1)
                milestone("Đã tiếp nhận tại kho", at: item.receivedAt, completed: currentStep >= 2)
                milestone("Đã nhập kho", at: item.stockedAt, completed: currentStep >= 3)
                milestone("Đã trao tặng", at: item.distributedAt, completed: currentStep >= 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppColors.surfacePrimary, in: RoundedRectangle(cornerRadius: 18))
    }

    private func milestone(_ title: String, at date: Date?, completed: Bool = true,
                           icon: String = "checkmark.circle.fill", color: Color = AppColors.primary) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: completed ? icon : "circle")
                .foregroundStyle(completed ? color : AppColors.textTertiary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).foregroundStyle(completed ? AppColors.textPrimary : AppColors.textSecondary)
                if completed, let date { Text(VietnameseDateText.dateTime(date)).font(.caption).foregroundStyle(AppColors.textSecondary) }
            }
            .font(.subheadline)
        }
    }

    private func photo(url: URL?, publicId: String?, label: String) -> some View {
        DonationHistoryPhoto(donationId: item.id, publicId: publicId, url: url, icon: item.category.iconName, label: label)
    }
}

private struct DonationHistoryPhoto: View {
    let donationId: String
    let publicId: String?
    let url: URL?
    let icon: String
    let label: String
    @State private var protectedURL: URL?

    var body: some View {
        AsyncImage(url: protectedURL ?? url) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else {
                Image(systemName: icon)
                    .font(.largeTitle)
                    .foregroundStyle(AppColors.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: 220, height: 160)
        .background(AppColors.primarySoft)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityLabel(label)
        .task(id: publicId) {
            protectedURL = nil
            if let publicId {
                protectedURL = try? await CloudinaryImageService.shared.privateDonationImageURL(donationId: donationId, publicId: publicId)
            }
        }
    }
}

#Preview {
    DonationHistoryDetailView(
        item: DonationItem(id: "preview-donation", donorId: "preview-donor", title: "Sách giáo khoa",
                           description: "Sách lớp 5, đủ bộ và còn tốt.", category: .books, condition: .good,
                           status: .distributed, imageUrl: nil, createdAt: .now, statusNote: nil,
                           campaignId: "preview-campaign", confirmationCode: "RS-1234", quantity: 2, unitId: "set",
                           aiPredictedCategory: .books, aiConfidence: 0.91, donorConfirmedCategory: .books),
        hubName: "Điểm tiếp nhận Hải Châu (minh hoạ)", campaignTitle: "Sách gửi em"
    )
}
