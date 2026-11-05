import SwiftUI
import PhotosUI

struct DonationResubmitView: View {
    let item: DonationItem
    let onResubmitted: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var notes: String
    @State private var category: DonationCategory
    @State private var condition: ItemCondition
    @State private var unit: DonationUnit
    @State private var quantity: String
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var photos: [UIImage] = []
    @State private var uploaded: [CloudinaryUploadedImage] = []
    @State private var uploadId = UUID().uuidString
    @State private var requestKey = UUID().uuidString
    @State private var openedVersion: Int
    @State private var pendingRequest: DonationResubmissionService.Request?
    @State private var saving = false
    @State private var loadingPhotos = false
    @State private var replacementImagesRequired: Bool
    @State private var error: String?

    init(item: DonationItem, onResubmitted: @escaping () -> Void = {}) {
        self.item = item
        self.onResubmitted = onResubmitted
        _title = State(initialValue: item.title)
        _notes = State(initialValue: item.description)
        _category = State(initialValue: item.category)
        _condition = State(initialValue: item.condition)
        _unit = State(initialValue: DonationUnit(rawValue: item.unitId ?? "piece") ?? .piece)
        _quantity = State(initialValue: item.quantity.map { String($0) } ?? "1")
        _openedVersion = State(initialValue: item.version ?? 1)
        _replacementImagesRequired = State(initialValue: item.imageProvider != "cloudinary" || !(3...6).contains(item.imagePublicIds?.count ?? 0))
    }

    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf16.count <= 120 && notes.utf16.count <= 3000 &&
        DonationQuantity.amount(quantity, unitId: unit.rawValue) != nil &&
        (selectedPhotos.isEmpty ? !replacementImagesRequired : (3...6).contains(photos.count) && photos.count == selectedPhotos.count) && !loadingPhotos
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Yêu cầu từ người duyệt") { Text(item.statusNote ?? "Vui lòng bổ sung thông tin.") }
                Section("Thông tin món đồ") {
                    TextField("Tên món đồ", text: $title)
                    TextField("Mô tả bổ sung", text: $notes, axis: .vertical).lineLimit(3...8)
                    Picker("Danh mục", selection: $category) {
                        ForEach(DonationCategory.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Tình trạng", selection: $condition) {
                        ForEach(ItemCondition.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Đơn vị", selection: $unit) {
                        ForEach(DonationUnit.allCases) { Text($0.title).tag($0) }
                    }
                    TextField("Số lượng", text: $quantity).keyboardType(.decimalPad)
                    Text("Đơn vị đếm dùng số nguyên dương; kg tối đa 3 số lẻ.").font(.caption)
                }
                Section("Ảnh") {
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 6, matching: .images) {
                        Text(selectedPhotos.isEmpty ? "Chọn 3–6 ảnh để thay bộ ảnh hiện tại" : "Đã chọn \(photos.count)/\(selectedPhotos.count) ảnh")
                    }
                    if replacementImagesRequired {
                        Text("Bộ ảnh hiện tại không đủ điều kiện gửi lại. Vui lòng chọn 3–6 ảnh mới để thay thế.")
                            .font(.caption).foregroundStyle(.orange)
                    } else if selectedPhotos.isEmpty {
                        Text("Giữ nguyên bộ ảnh hiện tại nếu chỉ cần bổ sung nội dung.").font(.caption)
                    }
                    if !selectedPhotos.isEmpty {
                        ScrollView(.horizontal) {
                            HStack { ForEach(photos.indices, id: \.self) { Image(uiImage: photos[$0]).resizable().scaledToFill().frame(width: 72, height: 72).clipped() } }
                        }
                        if !replacementImagesRequired {
                            Button("Giữ lại ảnh hiện tại") { selectedPhotos = [] }
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button(action: submit) {
                        if saving { ProgressView("Đang gửi bổ sung…") } else { Text("Gửi lại để duyệt") }
                    }.disabled(!valid)
                }
            }
            .disabled(saving)
            .navigationTitle("Bổ sung thông tin")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() }.disabled(saving) } }
            .interactiveDismissDisabled(saving)
            .onChange(of: [title, notes, category.rawValue, condition.rawValue, unit.rawValue, quantity]) { _, _ in requestKey = UUID().uuidString; pendingRequest = nil }
            .task(id: selectedPhotos) {
                let selection = selectedPhotos
                loadingPhotos = true
                defer { if selectedPhotos == selection { loadingPhotos = false } }
                photos = []; uploaded = []; uploadId = UUID().uuidString; requestKey = UUID().uuidString; pendingRequest = nil
                var loaded: [UIImage] = []
                for selected in selection {
                    guard !Task.isCancelled else { return }
                    let data = try? await selected.loadTransferable(type: Data.self)
                    guard !Task.isCancelled else { return }
                    if let data, let image = UIImage(data: data) { loaded.append(image) }
                }
                guard !Task.isCancelled, selectedPhotos == selection else { return }
                photos = loaded
                error = !selection.isEmpty && photos.count != selection.count ? "Có ảnh chưa đọc được. Vui lòng chọn lại." : nil
            }
        }
    }

    private func submit() {
        guard valid, !saving, let amount = DonationQuantity.amount(quantity, unitId: unit.rawValue) else { return }
        saving = true; error = nil
        Task { @MainActor in
            defer { saving = false }
            do {
                if !photos.isEmpty && uploaded.isEmpty {
                    uploaded = try await CloudinaryImageService.shared.uploadImages(photos, purpose: .donation, recordId: uploadId, maxPixelDimension: 2048)
                }
                let request = pendingRequest ?? DonationResubmissionService.Request(
                    title: title, description: notes, category: category.rawValue, condition: condition.rawValue,
                    quantity: amount, unitId: unit.rawValue, expectedVersion: openedVersion,
                    idempotencyKey: requestKey, imagePublicIds: uploaded.isEmpty ? nil : uploaded.map(\.publicId),
                    imageUploadRecordId: uploaded.isEmpty ? nil : uploadId)
                pendingRequest = request
                try await DonationResubmissionService.submit(donationId: item.id, request: request)
                onResubmitted()
                dismiss()
            } catch {
                if let apiError = error as? DonationResubmissionService.APIError, apiError.code == "REPLACEMENT_IMAGES_REQUIRED" {
                    replacementImagesRequired = true
                    pendingRequest = nil
                    requestKey = UUID().uuidString
                }
                self.error = error.localizedDescription
            }
        }
    }
}
