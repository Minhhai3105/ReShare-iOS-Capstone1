//
//  AppTypography.swift
//  ReShare
//
//  Design System - Typography Tokens
//

import SwiftUI

/// Hệ thống Typography chuẩn cho ReShare
struct AppTypography {
    static let titleLarge = Font.system(size: 24, weight: .bold, design: .rounded)
    static let titleMedium = Font.system(size: 18, weight: .semibold, design: .rounded)
    static let body = Font.system(size: 16, weight: .regular, design: .default)
    static let caption = Font.system(size: 13, weight: .medium, design: .default)
    static let button = Font.system(size: 16, weight: .semibold, design: .rounded)
}
