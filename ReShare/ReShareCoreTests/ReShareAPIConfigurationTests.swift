import XCTest
@testable import ReShareCore

final class ReShareAPIConfigurationTests: XCTestCase {
    func testHTTPSWorksWithReleasePolicy() {
        XCTAssertEqual(ReShareAPIConfiguration.baseURL(" https://api.example.test:8443/base ", allowLocalHTTP: false)?.absoluteString,
                       "https://api.example.test:8443/base")
    }

    func testLocalHTTPIsExplicitlyLimitedToDebugHosts() {
        for host in ["localhost", "127.0.0.1", "[::1]", "10.0.0.2", "172.16.0.2", "172.31.255.254", "192.168.1.5", "macbook.local"] {
            let raw = "http://\(host):3000"
            XCTAssertNotNil(ReShareAPIConfiguration.baseURL(raw, allowLocalHTTP: true), raw)
            XCTAssertNil(ReShareAPIConfiguration.baseURL(raw, allowLocalHTTP: false), raw)
        }
        for raw in ["http://api.example.test", "http://localhost.evil.test", "http://8.8.8.8", "http://172.15.0.1", "http://172.32.0.1", "http://192.169.0.1"] {
            XCTAssertNil(ReShareAPIConfiguration.baseURL(raw, allowLocalHTTP: true), raw)
        }
    }

    func testInvalidAndCredentialBearingBaseURLsAreRejected() {
        for raw in ["", "localhost:3000", "file:///tmp/api", "https:///", "https://user:password@api.example.test", "https://api.example.test?token=x", "https://api.example.test/#fragment", "http://192.168.1.999:3000", "https://api.example.test:99999"] {
            XCTAssertNil(ReShareAPIConfiguration.baseURL(raw, allowLocalHTTP: true), raw)
        }
    }

    func testBuildConfigurationControlsLocalHTTP() {
        #if DEBUG
        XCTAssertTrue(ReShareAPIConfiguration.allowsLocalHTTP)
        #else
        XCTAssertFalse(ReShareAPIConfiguration.allowsLocalHTTP)
        #endif
    }
}
