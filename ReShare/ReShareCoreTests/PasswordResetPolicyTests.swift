import XCTest
@testable import ReShareCore

final class PasswordResetPolicyTests: XCTestCase {
    func testNormalizedEmailTrimsWhitespace() {
        XCTAssertEqual(PasswordResetPolicy.normalizedEmail("  donor@example.com \n"), "donor@example.com")
    }

    func testNormalizedEmailRejectsObviousTypos() {
        let invalid = ["", "   ", "donor", "donor@", "@example.com", "donor@example",
                       "donor@.com", "donor@example.", "donor@@example.com", "do nor@example.com"]
        for value in invalid {
            XCTAssertNil(PasswordResetPolicy.normalizedEmail(value), "phải từ chối: \(value)")
        }
    }

    func testNormalizedEmailRejectsOverlongAddress() {
        let local = String(repeating: "a", count: 250)
        XCTAssertNil(PasswordResetPolicy.normalizedEmail("\(local)@example.com"))
    }

    func testResendAllowedWhenNothingSentYet() {
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: nil), 0)
    }

    func testResendCooldownCountsDownAndRoundsUp() {
        let sentAt = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: sentAt, now: sentAt), 60)
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: sentAt, now: sentAt.addingTimeInterval(0.4)), 60)
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: sentAt, now: sentAt.addingTimeInterval(59.5)), 1)
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: sentAt, now: sentAt.addingTimeInterval(60)), 0)
        XCTAssertEqual(PasswordResetPolicy.secondsUntilResend(lastSentAt: sentAt, now: sentAt.addingTimeInterval(600)), 0)
    }
}
