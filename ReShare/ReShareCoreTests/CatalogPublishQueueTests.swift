import XCTest
@testable import ReShareCore

final class CatalogPublishStoreTests: XCTestCase {
    func testPhotosPayloadAndStableImageIDsSurviveReopeningStore() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let job = makeJob()
        let images = sampleImages()
        try await CatalogPublishStore(root: root).create(job, images: images, thumbnail: Data([9]))
        let reopened = CatalogPublishStore(root: root)
        let loaded = try await reopened.load(donorId: "donor-a")
        XCTAssertEqual(loaded, [job])
        let restoredImages = try await reopened.images(for: job)
        let thumbnail = try await reopened.thumbnail(for: job)
        XCTAssertEqual(restoredImages, images)
        XCTAssertEqual(thumbnail, Data([9]))
    }

    func testStoreFiltersAccountsAndDoesNotOverwriteDuplicateDraft() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let a = makeJob()
        let b = makeJob(owner: "donor-b")
        try await store.create(a, images: sampleImages(), thumbnail: Data([1]))
        try await store.create(b, images: sampleImages(), thumbnail: Data([2]))
        do {
            try await store.create(a, images: sampleImages(), thumbnail: Data([3]))
            XCTFail("An existing pending draft must not be overwritten")
        } catch CatalogPublishQueueError.duplicateDraft {}
        let loadedA = try await store.load(donorId: "donor-a")
        let loadedB = try await store.load(donorId: "donor-b")
        XCTAssertEqual(loadedA, [a])
        XCTAssertEqual(loadedB, [b])
    }

    func testRejectsInvalidPathAndMissingPhotosBeforeCommittingManifest() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let invalid = makeJob(id: "../outside")
        do {
            try await store.create(invalid, images: sampleImages(), thumbnail: Data([1]))
            XCTFail("Unsafe IDs must not become filesystem paths")
        } catch CatalogPublishQueueError.invalidDraft {}
        do {
            try await store.create(makeJob(), images: [Data([1])], thumbnail: Data([1]))
            XCTFail("All photos must be durable before the draft becomes visible")
        } catch CatalogPublishQueueError.invalidDraft {}
        let loaded = try await store.load(donorId: "donor-a")
        XCTAssertTrue(loaded.isEmpty)
    }

    func testCorruptManifestIsReportedWithoutDeletingPhotos() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let job = makeJob()
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        try Data("broken JSON".utf8).write(to: root.appendingPathComponent(job.id).appendingPathComponent("job.json"))
        do {
            _ = try await store.load(donorId: "donor-a")
            XCTFail("A corrupted queue must not be reported as empty")
        } catch {}
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent(job.id).appendingPathComponent("0.jpg").path))
    }

    func testReadsDraftCreatedBeforeCancellationFlagWasAdded() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let job = makeJob()
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        let manifest = root.appendingPathComponent(job.id).appendingPathComponent("job.json")
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
        json.removeValue(forKey: "cancellationRequested")
        try JSONSerialization.data(withJSONObject: json).write(to: manifest)
        let restored = try await store.load(donorId: "donor-a")
        XCTAssertEqual(restored, [job])
        XCTAssertNil(restored.first?.cancellationRequested)
    }
}

@MainActor
final class CatalogPublishQueueTests: XCTestCase {
    func testEnqueueReturnsBeforeNetworkFinishesAndImagesAreDurable() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let transport = PublishTransportStub()
        transport.holdUploads = true
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { transport.heldCount == 1 }
        XCTAssertEqual(queue.jobs.first?.state, .uploading)
        XCTAssertTrue(transport.publishedIDs.isEmpty)
        let durable = try await store.load(donorId: "donor-a")
        XCTAssertEqual(durable.first?.id, job.id)
        queue.setUser(nil)
        transport.releaseUploads()
    }

    func testUploadFailureKeepsCheckpointAndRetryOnlySendsMissingImages() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let transport = PublishTransportStub()
        transport.failUploadOnce = true
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { queue.jobs.first?.state == .failed }
        XCTAssertEqual(queue.jobs.first?.completedImageCount, 1)
        await queue.retry(job.id)
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.sentIndices, [[0, 1, 2], [1, 2]])
        XCTAssertEqual(transport.receivedImageIDs, [job.imageClientIDs, job.imageClientIDs])
        XCTAssertEqual(transport.publishedIDs, [job.id])
        let durable = try await store.load(donorId: "donor-a")
        XCTAssertTrue(durable.isEmpty)
        queue.setUser(nil)
    }

    func testInterruptedUploadRestoresAndKeepsRecordAndImageIDs() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        var job = makeJob()
        job.state = .uploading
        job.uploaded[0] = asset(job, index: 0)
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        let transport = PublishTransportStub()
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.sentIndices, [[1, 2]])
        XCTAssertEqual(transport.receivedImageIDs, [job.imageClientIDs])
        XCTAssertEqual(transport.publishedIDs, [job.id])
        queue.setUser(nil)
    }

    func testLostPublishAcknowledgementRetriesSameRecordWithoutUploadingAgain() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = PublishTransportStub()
        transport.losePublishAcknowledgementOnce = true
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { queue.jobs.first?.state == .failed }
        XCTAssertEqual(transport.publishedIDs, [job.id])
        await queue.retry(job.id)
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.sentIndices, [[0, 1, 2], []])
        XCTAssertEqual(transport.publishAttempts, [job.id, job.id])
        XCTAssertEqual(transport.publishedIDs.count, 1)
        queue.setUser(nil)
    }

    func testRestoringSavingStageDoesNotUploadExistingImages() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var job = makeJob()
        job.state = .saving
        job.uploaded = job.uploaded.indices.map { asset(job, index: $0) }
        try await CatalogPublishStore(root: root).create(job, images: sampleImages(), thumbnail: Data([1]))
        let transport = PublishTransportStub()
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.sentIndices, [[]])
        queue.setUser(nil)
    }

    func testSwitchingAccountStopsLateCallbacksAndRestoresOnlyNewOwner() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let transport = PublishTransportStub()
        transport.holdUploads = true
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        let oldJob = makeJob()
        try await queue.enqueue(oldJob, images: sampleImages(), thumbnail: Data([1]))
        try await until { transport.heldCount == 1 }
        var newJob = makeJob(owner: "donor-b")
        newJob.state = .failed
        try await store.create(newJob, images: sampleImages(), thumbnail: Data([2]))
        queue.setUser("donor-b")
        try await until { !queue.isRestoring }
        transport.releaseUploads()
        await Task.yield()
        XCTAssertEqual(queue.jobs.map(\.id), [newJob.id])
        XCTAssertEqual(queue.jobs.first?.state, .failed)
        XCTAssertTrue(transport.publishAttempts.isEmpty)
        let oldDurable = try await store.load(donorId: "donor-a")
        XCTAssertEqual(oldDurable.first?.id, oldJob.id)
        queue.setUser(nil)
    }

    func testCannotEnqueueAnotherAccountsPayload() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let transport = PublishTransportStub()
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        do {
            try await queue.enqueue(makeJob(owner: "donor-b"), images: sampleImages(), thumbnail: Data([1]))
            XCTFail("A draft must stay with its authenticated owner")
        } catch CatalogPublishQueueError.accountChanged {}
        let wrongOwner = try await store.load(donorId: "donor-b")
        XCTAssertTrue(wrongOwner.isEmpty)
        XCTAssertTrue(transport.publishAttempts.isEmpty)
        queue.setUser(nil)
    }

    func testFailureDoesNotBlockNextJobAndFailedDraftRemainsRetryableAfterRestart() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = PublishTransportStub()
        transport.failUploadOnce = true
        let store = CatalogPublishStore(root: root)
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        let first = makeJob()
        let second = makeJob()
        try await queue.enqueue(first, images: sampleImages(), thumbnail: Data([1]))
        try await queue.enqueue(second, images: sampleImages(), thumbnail: Data([2]))
        try await until { queue.jobs.contains { $0.id == second.id && $0.state == .published } }
        XCTAssertEqual(queue.jobs.first(where: { $0.id == first.id })?.state, .failed)
        queue.setUser(nil)
        let restored = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: PublishTransportStub())
        restored.setUser("donor-a")
        try await until { !restored.isRestoring }
        XCTAssertEqual(restored.jobs.map(\.id), [first.id])
        XCTAssertEqual(restored.jobs.first?.state, .failed)
        restored.setUser(nil)
    }

    func testDeletingAccountCancelsWorkerAndPurgesOnlyItsDrafts() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        let transport = PublishTransportStub()
        transport.holdUploads = true
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        try await queue.enqueue(makeJob(), images: sampleImages(), thumbnail: Data([1]))
        try await until { transport.heldCount == 1 }
        let other = makeJob(owner: "donor-b")
        try await store.create(other, images: sampleImages(), thumbnail: Data([2]))
        try await queue.discardDrafts(donorId: "donor-a")
        transport.releaseUploads()
        let deletedOwner = try await store.load(donorId: "donor-a")
        let otherOwner = try await store.load(donorId: "donor-b")
        XCTAssertTrue(deletedOwner.isEmpty)
        XCTAssertEqual(otherOwner, [other])
        XCTAssertNil(queue.donorId)
        XCTAssertTrue(queue.jobs.isEmpty)
        XCTAssertTrue(transport.publishAttempts.isEmpty)
    }

    func testRepeatedRetryDoesNotScheduleDuplicatePublication() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = PublishTransportStub()
        transport.failUploadOnce = true
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { queue.jobs.first?.state == .failed }
        async let first: Void = queue.retry(job.id)
        async let second: Void = queue.retry(job.id)
        _ = await (first, second)
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.publishAttempts, [job.id])
        queue.setUser(nil)
    }

    func testCancellationCleansRemoteBeforeRemovingDraftWithOrWithoutCheckpointedImages() async throws {
        for hasUploadedImage in [false, true] {
            let root = temporaryRoot()
            defer { try? FileManager.default.removeItem(at: root) }
            let store = CatalogPublishStore(root: root)
            var job = makeJob()
            job.state = .failed
            if hasUploadedImage { job.uploaded[0] = asset(job, index: 0) }
            try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
            let transport = PublishTransportStub()
            transport.onCleanup = { candidate in
                let durable = try await store.load(donorId: "donor-a")
                XCTAssertEqual(durable.first?.id, candidate.id)
                XCTAssertEqual(durable.first?.cancellationRequested, true)
                let images = try await store.images(for: candidate)
                XCTAssertEqual(images, sampleImages(), "Local photos must remain until cleanup succeeds")
            }
            let queue = CatalogPublishQueue(store: store, transport: transport)
            queue.setUser("donor-a")
            try await until { !queue.isRestoring }
            await queue.cancel(job.id)
            let durable = try await store.load(donorId: "donor-a")
            XCTAssertEqual(transport.cleanupJobs.map(\.id), [job.id])
            XCTAssertTrue(durable.isEmpty)
            XCTAssertTrue(queue.jobs.isEmpty)
            XCTAssertTrue(queue.cancellingIDs.isEmpty)
            queue.setUser(nil)
        }
    }

    func testCleanupFailureKeepsDraftAndPreventsPublishingPossiblyDeletedImages() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        var job = makeJob()
        job.state = .failed
        job.uploaded[0] = asset(job, index: 0)
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        let transport = PublishTransportStub()
        transport.cleanupError = URLError(.networkConnectionLost)
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        try await until { !queue.isRestoring }
        await queue.cancel(job.id)
        let durable = try await store.load(donorId: "donor-a")
        XCTAssertEqual(durable.first?.cancellationRequested, true)
        XCTAssertEqual(queue.jobs.first?.state, .failed)
        XCTAssertTrue(queue.jobs.first?.errorMessage?.contains("Chưa huỷ") == true)
        let images = try await store.images(for: job)
        XCTAssertEqual(images, sampleImages())
        transport.cleanupError = nil
        await queue.retry(job.id)
        XCTAssertTrue(transport.sentIndices.isEmpty)
        XCTAssertTrue(transport.publishAttempts.isEmpty)
        await queue.cancel(job.id)
        XCTAssertTrue(queue.jobs.isEmpty)
        XCTAssertEqual(transport.cleanupJobs.count, 2)
        queue.setUser(nil)
    }

    func testCancellationRejectsUploadingAndPublishedStates() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = PublishTransportStub()
        transport.holdUploads = true
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { transport.heldCount == 1 }
        await queue.cancel(job.id)
        XCTAssertTrue(transport.cleanupJobs.isEmpty)
        XCTAssertEqual(queue.jobs.first?.state, .uploading)
        transport.releaseUploads()
        try await until { queue.jobs.first?.state == .published }
        await queue.cancel(job.id)
        XCTAssertTrue(transport.cleanupJobs.isEmpty)
        XCTAssertEqual(queue.jobs.first?.state, .published)
        queue.setUser(nil)
    }

    func testCancellationSurvivesAccountSwitchWithoutDeletingTheOldOwnersDraft() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = CatalogPublishStore(root: root)
        var job = makeJob()
        job.state = .failed
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        let transport = PublishTransportStub()
        transport.holdCleanup = true
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        try await until { !queue.isRestoring }
        let cancellation = Task { await queue.cancel(job.id) }
        try await until { transport.cleanupHeld }
        queue.setUser("donor-b")
        try await until { !queue.isRestoring }
        XCTAssertTrue(queue.jobs.isEmpty)
        queue.setUser("donor-a")
        try await until { !queue.isRestoring }
        await queue.retry(job.id)
        await queue.cancel(job.id)
        XCTAssertTrue(transport.sentIndices.isEmpty)
        XCTAssertEqual(transport.cleanupJobs.count, 1)
        transport.releaseCleanup()
        await cancellation.value
        let durable = try await store.load(donorId: "donor-a")
        XCTAssertEqual(durable.first?.id, job.id)
        XCTAssertEqual(queue.jobs.first?.id, job.id)
        XCTAssertEqual(durable.first?.cancellationRequested, true)
        XCTAssertTrue(queue.cancellingIDs.isEmpty)
        queue.setUser(nil)
    }

    func testAlreadyPublishedCancellationRetainsPhotosAndRetryAcknowledgesSamePost() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = PublishTransportStub()
        transport.losePublishAcknowledgementOnce = true
        let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
        queue.setUser("donor-a")
        let job = makeJob()
        try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
        try await until { queue.jobs.first?.state == .failed }
        await queue.cancel(job.id)
        XCTAssertNil(queue.jobs.first?.cancellationRequested)
        XCTAssertEqual(queue.jobs.first?.completedImageCount, 3)
        XCTAssertTrue(queue.jobs.first?.errorMessage?.contains("được đăng") == true)
        await queue.retry(job.id)
        try await until { queue.jobs.first?.state == .published }
        XCTAssertEqual(transport.sentIndices, [[0, 1, 2], []])
        XCTAssertEqual(transport.publishedIDs.count, 1)
        queue.setUser(nil)
    }

    func testInterruptedCancellationRestoresCleanupIntentInsteadOfPublishing() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var job = makeJob()
        job.state = .failed
        job.cancellationRequested = true
        job.uploaded[0] = asset(job, index: 0)
        let store = CatalogPublishStore(root: root)
        try await store.create(job, images: sampleImages(), thumbnail: Data([1]))
        let transport = PublishTransportStub()
        let queue = CatalogPublishQueue(store: store, transport: transport)
        queue.setUser("donor-a")
        try await until { !queue.isRestoring }
        await queue.retry(job.id)
        XCTAssertTrue(transport.sentIndices.isEmpty)
        XCTAssertTrue(transport.publishAttempts.isEmpty)
        await queue.cancel(job.id)
        XCTAssertTrue(queue.jobs.isEmpty)
        XCTAssertEqual(transport.cleanupJobs.count, 1)
        queue.setUser(nil)
    }

    func testPermissionAndExpiredSessionMessagesDoNotSuggestNetworkRetry() async throws {
        for denied in [CatalogPublishQueueError.permissionDenied, .sessionExpired] {
            let root = temporaryRoot()
            defer { try? FileManager.default.removeItem(at: root) }
            let transport = PublishTransportStub()
            transport.publishError = denied
            let queue = CatalogPublishQueue(store: CatalogPublishStore(root: root), transport: transport)
            queue.setUser("donor-a")
            let job = makeJob()
            try await queue.enqueue(job, images: sampleImages(), thumbnail: Data([1]))
            try await until { queue.jobs.first?.state == .failed }
            let message = try XCTUnwrap(queue.jobs.first?.errorMessage)
            XCTAssertEqual(message, denied.errorDescription)
            XCTAssertFalse(message.localizedCaseInsensitiveContains("mạng"))
            queue.setUser(nil)
        }
    }

    private func until(_ condition: () -> Bool, file: StaticString = #filePath, line: UInt = #line) async throws {
        let deadline = Date().addingTimeInterval(5)
        while !condition() {
            guard Date() < deadline else {
                XCTFail("Timed out waiting for queue state", file: file, line: line)
                throw URLError(.timedOut)
            }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
    }
}

@MainActor
private final class PublishTransportStub: CatalogPublishTransport {
    var holdUploads = false
    var failUploadOnce = false
    var losePublishAcknowledgementOnce = false
    var sentIndices: [[Int]] = []
    var receivedImageIDs: [[String]] = []
    var publishAttempts: [String] = []
    var publishedIDs: Set<String> = []
    var publishError: Error?
    var cleanupError: Error?
    var cleanupJobs: [CatalogPublishJob] = []
    var onCleanup: ((CatalogPublishJob) async throws -> Void)?
    var holdCleanup = false
    private var cleanupContinuation: CheckedContinuation<Void, Never>?
    var cleanupHeld: Bool { cleanupContinuation != nil }
    private var continuations: [CheckedContinuation<Void, Never>] = []
    var heldCount: Int { continuations.count }

    func upload(_ images: [Data], job: CatalogPublishJob, onUploaded: @escaping @MainActor (Int, CatalogPublishAsset) async throws -> Void) async throws {
        let missing = job.uploaded.indices.filter { job.uploaded[$0] == nil }
        sentIndices.append(missing)
        receivedImageIDs.append(job.imageClientIDs)
        if holdUploads { await withCheckedContinuation { continuations.append($0) } }
        for index in missing {
            try await onUploaded(index, asset(job, index: index))
            if failUploadOnce {
                failUploadOnce = false
                throw URLError(.notConnectedToInternet)
            }
        }
    }

    func publish(_ job: CatalogPublishJob) async throws {
        publishAttempts.append(job.id)
        if let publishError { throw publishError }
        publishedIDs.insert(job.id)
        if losePublishAcknowledgementOnce {
            losePublishAcknowledgementOnce = false
            throw URLError(.timedOut)
        }
    }

    func cleanup(_ job: CatalogPublishJob) async throws {
        cleanupJobs.append(job)
        try await onCleanup?(job)
        if holdCleanup { await withCheckedContinuation { cleanupContinuation = $0 } }
        if publishedIDs.contains(job.id) { throw CatalogPublishQueueError.alreadyPublished }
        if let cleanupError { throw cleanupError }
    }

    func releaseCleanup() {
        holdCleanup = false
        cleanupContinuation?.resume()
        cleanupContinuation = nil
    }

    func releaseUploads() {
        holdUploads = false
        let pending = continuations
        continuations = []
        pending.forEach { $0.resume() }
    }
}

private func temporaryRoot() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("reshare-publish-tests-\(UUID().uuidString)", isDirectory: true)
}

private func sampleImages() -> [Data] { [Data([1, 2]), Data([3, 4]), Data([5, 6])] }

private func makeJob(owner: String = "donor-a", id: String = "cat_\(UUID().uuidString.lowercased())") -> CatalogPublishJob {
    CatalogPublishJob(id: id, payload: CatalogPublishPayload(
        donorId: owner, donorName: "Người thử", title: "Áo khoác", category: "Quần áo",
        condition: "Còn tốt", district: "Hải Châu", pickupAddress: "Địa chỉ thử riêng tư",
        donorNote: "Ghi chú thử", imageName: "tshirt.fill"
    ), imageCount: 3)
}

private func asset(_ job: CatalogPublishJob, index: Int) -> CatalogPublishAsset {
    CatalogPublishAsset(publicId: "catalog_items/\(job.id)/\(job.imageClientIDs[index])", secureURL: "https://res.cloudinary.com/test/\(job.imageClientIDs[index]).jpg")
}
