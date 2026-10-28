import SwiftUI

struct CatalogItemEditView: View {
    @Environment(\.dismiss) private var dismiss
    let item: CatalogItem

    @State private var title: String
    @State private var category: String
    @State private var condition: String
    @State private var district: String
    @State private var pickupAddress: String
    @State private var donorNote: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let categories = ["Quần áo", "Sách vở", "Gia dụng", "Mẹ & Bé", "Đồ điện tử"]
    private let conditions = ["Mới nguyên hộp", "Còn rất mới (95%)", "Còn tốt", "Dùng ổn"]
    private let districts = ["Hải Châu", "Sơn Trà", "Ngũ Hành Sơn", "Thanh Khê", "Cẩm Lệ", "Liên Chiểu"]
    private let primaryGreen = Color(red: 0.11, green: 0.35, blue: 0.20)

    init(item: CatalogItem) {
        self.item = item
        _title = State(initialValue: item.title)
        _category = State(initialValue: item.category)
        _condition = State(initialValue: item.condition)
        _district = State(initialValue: item.district)
        _pickupAddress = State(initialValue: item.pickupAddress)
        _donorNote = State(initialValue: item.donorNote)
    }

    private var imageName: String {
        switch category {
        case "Sách vở": return "book.closed.fill"
        case "Gia dụng": return "cup.and.saucer.fill"
        case "Mẹ & Bé": return "teddybear.fill"
        case "Đồ điện tử": return "laptopcomputer"
        case "Quần áo": return "tshirt.fill"
        default: return item.imageName
        }
    }

    private var canSave: Bool {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAddress = pickupAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSaving && !cleanTitle.isEmpty && cleanTitle.count <= 120 &&
            !cleanAddress.isEmpty && cleanAddress.count <= 240 && donorNote.count <= 1000
    }

    var body: some View {
        Form {
            Section("THÔNG TIN MÓN ĐỒ") {
                TextField("Tên món đồ", text: $title)
                    .textInputAutocapitalization(.sentences)
                Picker("Danh mục", selection: $category) {
                    if !categories.contains(category) { Text(category).tag(category) }
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
                Picker("Tình trạng", selection: $condition) {
                    if !conditions.contains(condition) { Text(condition).tag(condition) }
                    ForEach(conditions, id: \.self) { Text($0).tag($0) }
                }
            }

            Section("ĐỊA ĐIỂM HẸN NHẬN") {
                Picker("Quận tại Đà Nẵng", selection: $district) {
                    if !districts.contains(district) { Text(district).tag(district) }
                    ForEach(districts, id: \.self) { Text($0).tag($0) }
                }
                TextField("Địa chỉ hẹn cụ thể", text: $pickupAddress)
            }

            Section("LỜI NHẮN CHO NGƯỜI NHẬN") {
                TextEditor(text: $donorNote)
                    .frame(minHeight: 100)
                Text("\(donorNote.count)/1000")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section {
                Text("Ảnh đã đăng được giữ nguyên. Bạn chỉ có thể sửa bài khi món đồ còn sẵn sàng nhận.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.red)
                }
                Button(action: save) {
                    HStack {
                        Spacer()
                        if isSaving { ProgressView().tint(.white) }
                        Text(isSaving ? "Đang lưu..." : "Lưu thay đổi")
                            .fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(!canSave)
                .listRowBackground(primaryGreen)
                .foregroundColor(.white)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(red: 0.97, green: 0.98, blue: 0.96))
        .navigationTitle("Sửa bài đăng")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() {
        guard canSave, let ownerId = AuthService.shared.currentUserId, !ownerId.isEmpty else { return }
        isSaving = true
        errorMessage = nil
        let fields = CatalogItemEditFields(
            title: title, category: category, condition: condition,
            district: district, pickupAddress: pickupAddress,
            donorNote: donorNote, imageName: imageName
        )
        Task {
            do {
                try await FirestoreService.shared.updateCatalogItem(itemId: item.id, ownerId: ownerId, fields: fields)
                dismiss()
            } catch {
                errorMessage = "Không thể lưu: \(error.localizedDescription)"
                isSaving = false
            }
        }
    }
}
