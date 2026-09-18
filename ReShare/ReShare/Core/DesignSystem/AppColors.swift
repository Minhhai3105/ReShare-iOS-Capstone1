//
//  AppColors.swift
//  ReShare
//
//  Design System - Color Tokens
//

import SwiftUI

/// Wrapper ngữ nghĩa cho hệ thống màu (Tự động liên kết với Assets.xcassets)
enum AppColors {
    // Backgrounds
    static let background = Color.appBackground
    static let surfacePrimary = Color.surfacePrimary
    
    // Brand
    static let primary = Color.brandPrimary
    static let primaryPressed = Color.brandPrimaryPressed
    static let primarySoft = Color.brandPrimarySoft
    
    static let accent = Color.brandAccent
    static let accentPressed = Color.brandAccentPressed
    static let accentSoft = Color.brandAccentSoft
    
    // Text
    static let textPrimary = Color.textPrimary
    static let textSecondary = Color.textSecondary
    static let textTertiary = Color.textTertiary
    
    // Border
    static let border = Color.borderSubtle
    
    // Status
    static let pending = Color.statusPending
    static let pendingSoft = Color.statusPendingSoft
    static let distributed = Color.statusDistributed
    static let distributedSoft = Color.statusDistributedSoft
    static let rejected = Color.statusRejected
    static let rejectedSoft = Color.statusRejectedSoft
}
