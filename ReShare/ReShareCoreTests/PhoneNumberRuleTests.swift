import XCTest
@testable import ReShareCore

/// Số điện thoại không bắt buộc; nếu nhập thì phải đúng dạng (dùng ở màn Đăng ký và Hồ sơ).
final class PhoneNumberRuleTests: XCTestCase {
    func testEmptyIsAllowed() {
        XCTAssertTrue(PhoneNumberRule.isValid(""))
        XCTAssertTrue(PhoneNumberRule.isValid("   "))
    }

    func testCommonVietnameseFormats() {
        XCTAssertTrue(PhoneNumberRule.isValid("0905123456"))
        XCTAssertTrue(PhoneNumberRule.isValid("0905 123 456"))
        XCTAssertTrue(PhoneNumberRule.isValid("0905.123.456"))
        XCTAssertTrue(PhoneNumberRule.isValid("0905-123-456"))
        XCTAssertTrue(PhoneNumberRule.isValid("+84 905 123 456"))
        XCTAssertTrue(PhoneNumberRule.isValid(" 905 123 456 "))
    }

    func testRejectsTooFewOrTooManyDigits() {
        XCTAssertFalse(PhoneNumberRule.isValid("12345"))
        XCTAssertFalse(PhoneNumberRule.isValid("09051234567890"))
        XCTAssertFalse(PhoneNumberRule.isValid("+"))
    }

    func testRejectsLettersAndMisplacedPlus() {
        XCTAssertFalse(PhoneNumberRule.isValid("abc0905123456"))
        XCTAssertFalse(PhoneNumberRule.isValid("0905123456 ext"))
        XCTAssertFalse(PhoneNumberRule.isValid("++84905123456"))
        XCTAssertFalse(PhoneNumberRule.isValid("0905+123456"))
        XCTAssertFalse(PhoneNumberRule.isValid("０９０５１２３４５６"))
    }

    func testRejectsMoreThan32Characters() {
        XCTAssertFalse(PhoneNumberRule.isValid("0905 . . . . . . . . . . . . . . 123456"))
    }
}
