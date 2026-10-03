//
//  DonationCategory.swift
//  ReShare
//
//  Created by Cao Hai on 18/9/26.
//

import SwiftUI

enum DonationCategory: String, Codable, Identifiable, CaseIterable {
    case clothing = "clothing"
    case books = "books"
    case household = "household"
    
    // Identifiable conformance
    var id: String { rawValue }
}

extension DonationCategory {
    var title: String {
        switch self {
        case .clothing:
            return "Quần áo"
        case .books:
            return "Sách vở"
        case .household:
            return "Gia dụng"
        }
    }
    
    var iconName: String {
        switch self {
        case .clothing:
            return "tshirt"
        case .books:
            return "book.closed"
        case .household:
            return "house"
        }
    }
}
