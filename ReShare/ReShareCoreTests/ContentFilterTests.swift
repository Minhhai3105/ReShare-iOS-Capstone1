import XCTest
@testable import ReShareCore

final class ContentFilterTests: XCTestCase {
    func testBlocksVulgarWordsRegardlessOfCase() {
        for text in ["đéo biết", "ĐÉO", "Đồ CẶC", "dòng 1\nfuck", "đụ má mày", "Shit"] {
            XCTAssertTrue(ContentFilter.containsBlockedWord(text), text)
        }
    }

    func testAllowsOrdinaryWordsThatLookSimilar() {
        for text in ["Cho mình xin cái đĩa", "Mình ĐỤNG lịch", "BUỔI sáng", "admin cho hỏi", "Nồi cơm điện còn tốt"] {
            XCTAssertFalse(ContentFilter.containsBlockedWord(text), text)
        }
    }

    func testNormalizesDecomposedUnicode() {
        // "đéo" gõ bằng ký tự tổ hợp (e + dấu sắc rời) vẫn bị chặn ở app.
        let decomposed = "đe\u{0301}o"
        XCTAssertTrue(ContentFilter.containsBlockedWord(decomposed))
    }
}
