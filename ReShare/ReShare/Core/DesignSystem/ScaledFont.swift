import SwiftUI

/// Cỡ chữ co giãn theo cài đặt "Cỡ chữ" của iPhone (Dynamic Type).
///
/// Ở mức cỡ chữ mặc định, cỡ hiển thị đúng bằng cỡ thiết kế (`size`), nên giao diện không đổi.
/// Khi người dùng tăng/giảm cỡ chữ, cỡ được nhân theo tỉ lệ của kiểu chữ hệ thống gần nhất
/// (`relativeTo`). Mức tối đa được chặn ở `ContentView` bằng `.dynamicTypeSize(...xxLarge)`
/// để bố cục không vỡ.
private struct ScaledSystemFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let design: Font.Design

    init(size: CGFloat, weight: Font.Weight, design: Font.Design) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: Self.textStyle(for: size))
        self.weight = weight
        self.design = design
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: design))
    }

    /// Kiểu chữ hệ thống có cỡ mặc định gần với cỡ thiết kế, dùng làm thước co giãn.
    private static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<12: return .caption2
        case ..<13: return .caption
        case ..<14: return .footnote
        case ..<16: return .subheadline
        case ..<17: return .callout
        case ..<18: return .body
        case ..<21: return .title3
        case ..<25: return .title2
        case ..<31: return .title
        default: return .largeTitle
        }
    }
}

extension View {
    /// Thay cho `.font(.system(size:weight:design:))`: cùng tham số, nhưng co giãn theo Dynamic Type.
    func scaledFont(size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> some View {
        modifier(ScaledSystemFont(size: size, weight: weight, design: design))
    }
}
