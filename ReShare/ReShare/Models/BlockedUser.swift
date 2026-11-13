import Foundation

/// Một người mình đã chặn (`users/{uid}/blocks/{blockedUid}`). Tên lưu kèm lúc chặn vì app không đọc
/// được hồ sơ người khác (App Store Guideline 1.2).
struct BlockedUser: Identifiable, Equatable {
    let id: String
    let displayName: String
    let blockedAt: Date?
}
