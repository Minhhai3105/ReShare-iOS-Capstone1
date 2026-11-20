import Foundation
import XCTest
@testable import DonationStatusModel

final class DonationStatusTests: XCTestCase {
    func testCancelledStatusDecodesForHistory() throws {
        let status = try JSONDecoder().decode(DonationStatus.self, from: Data(#""cancelled""#.utf8))
        XCTAssertEqual(status, .cancelled)
        XCTAssertEqual(status.title, "Đã huỷ")
    }
}
