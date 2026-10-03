//
//  ItemCondition.swift
//  ReShare
//
//  Created by Cao Hai on 18/9/26.
//

import Foundation

enum ItemCondition: String, Codable, Identifiable, CaseIterable {
    case new = "new"
    case likeNew = "like_new"
    case good = "good"
    case fair = "fair"

    var id: String { rawValue }
}

extension ItemCondition {
    var title: String {
        switch self {
            case .new: return "Mới 100%"
            case .likeNew: return "Như mới (95%)"
            case .good: return "Còn tốt"
            case .fair: return "Dùng được"
        }
    }

    var description: String {
        switch self {
            case .new: return "Mới nguyên tem hộp, chưa qua sử dụng"
            case .likeNew: return "Dùng lướt, không có lỗi hay vết ố"
            case .good: return "Đã dùng nhưng còn tốt, sạch sẽ"
            case .fair: return "Có dấu hiệu sử dụng nhưng còn dùng tốt"
        }
    }
}
