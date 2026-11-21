import Foundation
import XCTest
@testable import DonationStatusModel

final class DonationStatusTests: XCTestCase {
    func testCancelledStatusDecodesForHistory() throws {
        let status = try JSONDecoder().decode(DonationStatus.self, from: Data(#""cancelled""#.utf8))
        XCTAssertEqual(status, .cancelled)
        XCTAssertEqual(status.title, "Đã huỷ")
    }

    func testPendingNeedsInformationShowsCanBoSung() {
        XCTAssertEqual(DonationStatus.pending.donorTitle(reviewState: "needs_information"), "Cần bổ sung")
        XCTAssertEqual(DonationStatus.pending.donorIconName(reviewState: "needs_information"), "exclamationmark.bubble")
    }

    func testOtherCasesKeepNormalTitle() {
        XCTAssertEqual(DonationStatus.pending.donorTitle(reviewState: nil), "Chờ tiếp nhận")
        XCTAssertEqual(DonationStatus.pending.donorTitle(reviewState: "resubmitted"), "Chờ tiếp nhận")
        // reviewState cũ còn sót trên đơn đã từ chối thì vẫn hiện "Từ chối"
        XCTAssertEqual(DonationStatus.rejected.donorTitle(reviewState: "needs_information"), "Từ chối")
        XCTAssertEqual(DonationStatus.approved.donorIconName(reviewState: nil), DonationStatus.approved.iconName)
    }
}
