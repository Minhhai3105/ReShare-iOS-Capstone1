import XCTest
@testable import ReShareCore

final class DonationQuantityTests: XCTestCase {
    func testCountUnitsRejectFractionsAndNonpositiveValues() {
        for unit in ["piece", "bag", "box", "set"] {
            XCTAssertEqual(DonationQuantity.baseUnits("8", unitId: unit), 8)
            for input in ["1.5", "0", "-1", "1e3", "", "NaN", "Infinity"] {
                XCTAssertNil(DonationQuantity.amount(input, unitId: unit), "\(unit)/\(input)")
            }
        }
    }

    func testKilogramsUseGramPrecisionAndVietnameseInput() {
        XCTAssertEqual(DonationQuantity.baseUnits("1.125", unitId: "kg"), 1125)
        XCTAssertEqual(DonationQuantity.baseUnits("1,125", unitId: "kg"), 1125)
        XCTAssertEqual(DonationQuantity.amount("0.001", unitId: "kg"), 0.001)
        XCTAssertNil(DonationQuantity.amount("0.0001", unitId: "kg"))
        XCTAssertNil(DonationQuantity.amount("9007199254741", unitId: "kg"))
        XCTAssertNil(DonationQuantity.amount("1", unitId: "litre"))
    }

    func testPartialThenFullDistributionHasNoRemainder() throws {
        let received = try XCTUnwrap(DonationQuantity.baseUnits("1.125", unitId: "kg"))
        let first = try XCTUnwrap(DonationQuantity.baseUnits("0.125", unitId: "kg"))
        let second = try XCTUnwrap(DonationQuantity.baseUnits("1", unitId: "kg"))
        XCTAssertEqual(received - first, 1000)
        XCTAssertEqual(received - first - second, 0)
    }
}
