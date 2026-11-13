import Foundation

/// Nhãn điểm tiếp nhận của một đơn trong Lịch sử quyên góp. Thứ tự nhóm đã chốt (13/11/2026):
/// 1. Tên lưu kèm đơn lúc gửi (`hubName`), giống biên nhận: điểm đổi tên hay ngừng hoạt động vẫn đúng tên.
/// 2. Đơn cũ chưa có `hubName`: tên của điểm đang hoạt động.
/// 3. Không có cả hai: nhãn chung.
/// Hậu tố "(minh hoạ)" theo trạng thái HIỆN TẠI của điểm, chỉ khi còn bản ghi điểm đang hoạt động.
/// Tách khỏi View để test trực tiếp đúng hàm màn Lịch sử dùng (ReShareCoreTests/HubDisplayNameTests).
enum HubDisplayName {
    static func label(hubId: String?, savedName: String?, currentName: String?, currentIsDemo: Bool?) -> String {
        guard let hubId, !hubId.isEmpty else { return "Chưa chọn điểm tiếp nhận" }
        let candidates = [savedName, currentName].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard let name = candidates.first(where: { !$0.isEmpty }) else { return "Điểm tiếp nhận" }
        return currentIsDemo == true ? "\(name) (minh hoạ)" : name
    }
}
