import XCTest
@testable import ReShareCore

final class CampaignRecordTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-11-10T03:00:00Z")!

    private func data(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var base: [String: Any] = [
            "title": "Áo ấm mùa lũ", "summary": "Áo khoác cho bà con", "description": "Câu chuyện",
            "organizer": "UBND xã Hòa Bắc", "category": "clothing", "unitId": "piece",
            "targetQuantity": 10, "receivedQuantity": 3, "receivedDonationCount": 2, "urgent": true,
            "endDate": ISO8601DateFormatter().date(from: "2026-12-20T16:59:59Z")!,
            "hubs": [["id": "hub-haichau", "name": "Hải Châu"], ["name": "thiếu id"]],
            "guidelines": ["Đồ sạch", ""], "status": "active",
        ]
        overrides.forEach { base[$0.key] = $0.value }
        return base
    }

    func testParsesFirestoreDataAndComputesProgress() throws {
        let record = try XCTUnwrap(CampaignRecord(id: "c1", data: data()))
        XCTAssertEqual(record.title, "Áo ấm mùa lũ")
        XCTAssertEqual(record.categoryId, "clothing")
        XCTAssertEqual(record.hubs, [CampaignRecord.HubRef(id: "hub-haichau", name: "Hải Châu")])
        XCTAssertEqual(record.guidelines, ["Đồ sạch"])
        XCTAssertEqual(record.progress, 0.3, accuracy: 0.0001)
        XCTAssertEqual(record.receivedDonationCount, 2)
        XCTAssertTrue(record.isAcceptingDonations(now: now))
        XCTAssertEqual(record.daysLeft(now: now), 40)
    }

    func testRejectsRecordsMissingRequiredFields() {
        for key in ["title", "category", "unitId", "targetQuantity", "endDate", "status"] {
            var raw = data()
            raw.removeValue(forKey: key)
            XCTAssertNil(CampaignRecord(id: "c1", data: raw), key)
        }
        XCTAssertNil(CampaignRecord(id: "c1", data: data(["category": "electronics"])))
        XCTAssertNil(CampaignRecord(id: "c1", data: data(["targetQuantity": 0])))
        XCTAssertNil(CampaignRecord(id: "c1", data: data(["targetQuantity": "10"])))
        XCTAssertNil(CampaignRecord(id: "c1", data: data(["targetQuantity": true])))
    }

    func testProgressIsClampedAndClosedOrExpiredCampaignsAreHidden() throws {
        XCTAssertEqual(try XCTUnwrap(CampaignRecord(id: "c1", data: data(["receivedQuantity": 25]))).progress, 1)
        let closed = try XCTUnwrap(CampaignRecord(id: "closed", data: data(["status": "closed"])))
        let expired = try XCTUnwrap(CampaignRecord(id: "expired", data: data(["endDate": now.addingTimeInterval(-60)])))
        XCTAssertFalse(closed.isAcceptingDonations(now: now))
        XCTAssertFalse(expired.isAcceptingDonations(now: now))
        XCTAssertEqual(expired.daysLeft(now: now), 0)
    }

    func testDisplayOrderPutsUrgentThenSoonestEndingFirst() throws {
        let later = try XCTUnwrap(CampaignRecord(id: "later", data: data(["urgent": false,
            "endDate": now.addingTimeInterval(30 * 86_400)])))
        let sooner = try XCTUnwrap(CampaignRecord(id: "sooner", data: data(["urgent": false,
            "endDate": now.addingTimeInterval(5 * 86_400)])))
        let urgent = try XCTUnwrap(CampaignRecord(id: "urgent", data: data(["endDate": now.addingTimeInterval(60 * 86_400)])))
        let closed = try XCTUnwrap(CampaignRecord(id: "closed", data: data(["status": "closed"])))
        XCTAssertEqual(CampaignRecord.openForDisplay([later, closed, sooner, urgent], now: now).map(\.id),
                       ["urgent", "sooner", "later"])
    }

    func testHubRecordRequiresActiveStatusAndDefaultsToDemo() throws {
        let raw: [String: Any] = ["name": "Hải Châu", "address": "Minh hoạ", "latitude": 16.06, "longitude": 108.22,
                                  "openHours": "Chưa hoạt động", "status": "active"]
        let hub = try XCTUnwrap(HubRecord(id: "hub-haichau", data: raw))
        XCTAssertTrue(hub.isDemo, "thiếu cờ isDemo thì coi là minh hoạ")
        var real = raw
        real["isDemo"] = false
        XCTAssertFalse(try XCTUnwrap(HubRecord(id: "hub-real", data: real)).isDemo)
        var inactive = raw
        inactive["status"] = "inactive"
        XCTAssertNil(HubRecord(id: "hub-off", data: inactive))
        var badCoordinate = raw
        badCoordinate["latitude"] = 200
        XCTAssertNil(HubRecord(id: "hub-bad", data: badCoordinate))
    }
}
