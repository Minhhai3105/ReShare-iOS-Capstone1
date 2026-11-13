import XCTest
@testable import ReShareCore

/// Bốn trường hợp review PR97 (81b5ad5) nêu, cộng các ca biên.
final class HubDisplayNameTests: XCTestCase {
    func testSavedNameWinsWhenActiveHubWasRenamed() {
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: "Tên lúc gửi", currentName: "Tên mới", currentIsDemo: false),
                       "Tên lúc gửi")
    }

    func testSavedNameKeptWhenHubInactiveOrNotLoaded() {
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: "Tên lúc gửi", currentName: nil, currentIsDemo: nil),
                       "Tên lúc gửi")
    }

    func testDemoSuffixFollowsCurrentHubButNameStaysSaved() {
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: "Tên lúc gửi", currentName: "Tên mới", currentIsDemo: true),
                       "Tên lúc gửi (minh hoạ)")
    }

    func testLegacyDonationUsesCurrentActiveHubName() {
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: nil, currentName: "Tên hiện tại", currentIsDemo: false),
                       "Tên hiện tại")
    }

    func testFallbacks() {
        XCTAssertEqual(HubDisplayName.label(hubId: nil, savedName: "X", currentName: "Y", currentIsDemo: true), "Chưa chọn điểm tiếp nhận")
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: nil, currentName: nil, currentIsDemo: nil), "Điểm tiếp nhận")
        XCTAssertEqual(HubDisplayName.label(hubId: "hub-a", savedName: "  ", currentName: "Tên hiện tại", currentIsDemo: nil),
                       "Tên hiện tại", "tên rỗng không che tên điểm hiện tại")
    }
}
