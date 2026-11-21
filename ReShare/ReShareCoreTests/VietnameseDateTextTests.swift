import XCTest
@testable import ReShareCore

final class VietnameseDateTextTests: XCTestCase {
    private let vietnam = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    // 2026-11-20 14:44:00 UTC = 21:44 giờ Việt Nam
    private let sample = Date(timeIntervalSince1970: 1_795_185_840)

    func testDateTimeUsesDayMonthYearAnd24HourClock() {
        XCTAssertEqual(VietnameseDateText.dateTime(sample, timeZone: vietnam), "20/11/2026 21:44")
    }

    func testDateOnly() {
        XCTAssertEqual(VietnameseDateText.date(sample, timeZone: vietnam), "20/11/2026")
    }

    func testNoEnglishMonthOrAtRegardlessOfDeviceLanguage() {
        let text = VietnameseDateText.dateTime(sample, timeZone: vietnam)
        XCTAssertFalse(text.contains("Nov"))
        XCTAssertFalse(text.contains(" at "))
    }
}
