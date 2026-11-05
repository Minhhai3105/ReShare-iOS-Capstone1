import Foundation

enum DonationQuantity {
    nonisolated static func baseUnits(_ input: String, unitId: String) -> Int64? {
        let scale: Int64
        switch unitId {
        case "kg": scale = 1000
        case "piece", "bag", "box", "set": scale = 1
        default: return nil
        }
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        guard text.count <= 32,
              text.range(of: #"^[0-9]+(?:\.[0-9]+)?$"#, options: .regularExpression) != nil else { return nil }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        var fraction = parts.count == 2 ? String(parts[1]) : ""
        while fraction.last == "0" { fraction.removeLast() }
        let places = scale == 1000 ? 3 : 0
        guard fraction.count <= places, let whole = Int64(parts[0]) else { return nil }
        let padded = fraction + String(repeating: "0", count: places - fraction.count)
        guard let remainder = Int64(padded.isEmpty ? "0" : padded) else { return nil }
        let product = whole.multipliedReportingOverflow(by: scale)
        let sum = product.partialValue.addingReportingOverflow(remainder)
        guard !product.overflow, !sum.overflow, sum.partialValue > 0,
              sum.partialValue <= 9_007_199_254_740_991 else { return nil }
        return sum.partialValue
    }

    nonisolated static func amount(_ input: String, unitId: String) -> Double? {
        guard let base = baseUnits(input, unitId: unitId) else { return nil }
        return Double(base) / (unitId == "kg" ? 1000 : 1)
    }
}
