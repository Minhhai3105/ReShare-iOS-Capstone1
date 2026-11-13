import XCTest
@testable import ReShareCore

final class GoogleSignInSetupTests: XCTestCase {
    private let clientID = "123-abc.apps.googleusercontent.com"
    private let reversed = "com.googleusercontent.apps.123-abc"

    func testReversedClientIDMatchesFirebaseFormat() {
        XCTAssertEqual(GoogleSignInSetup.reversedClientID(clientID), reversed)
    }

    func testReversedClientIDRejectsMalformedValues() {
        for value in ["", "   ", "noDot", ".apps.googleusercontent.com", "123..com"] {
            XCTAssertNil(GoogleSignInSetup.reversedClientID(value), "phải từ chối: \(value)")
        }
    }

    func testConfiguredWhenSchemeRegistered() {
        let urlTypes: [[String: Any]] = [["CFBundleURLName": "google-sign-in", "CFBundleURLSchemes": [reversed]]]
        XCTAssertTrue(GoogleSignInSetup.isConfigured(clientID: clientID, urlTypes: urlTypes))
    }

    func testNotConfiguredWithoutClientID() {
        let urlTypes: [[String: Any]] = [["CFBundleURLSchemes": [reversed]]]
        XCTAssertFalse(GoogleSignInSetup.isConfigured(clientID: nil, urlTypes: urlTypes))
    }

    func testNotConfiguredWhenSchemeMissingOrEmpty() {
        // Build setting GOOGLE_REVERSED_CLIENT_ID còn trống thì Info.plist chứa scheme rỗng.
        let emptyScheme: [[String: Any]] = [["CFBundleURLSchemes": [""]]]
        XCTAssertFalse(GoogleSignInSetup.isConfigured(clientID: clientID, urlTypes: emptyScheme))
        XCTAssertFalse(GoogleSignInSetup.isConfigured(clientID: clientID, urlTypes: nil))
        let otherScheme: [[String: Any]] = [["CFBundleURLSchemes": ["com.googleusercontent.apps.khac"]]]
        XCTAssertFalse(GoogleSignInSetup.isConfigured(clientID: clientID, urlTypes: otherScheme))
    }
}
