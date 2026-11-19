import Foundation
import Combine

@MainActor
protocol CatalogPublishTransport {
    func upload(
        _ images: [Data], job: CatalogPublishJob,
        onUploaded: @escaping @MainActor (Int, CatalogPublishAsset) async throws -> Void
    ) async throws
    func publish(_ job: CatalogPublishJob) async throws
    func cleanup(_ job: CatalogPublishJob) async throws
}

/// Hàng đợi thuộc vòng đời app, không thuộc màn nhập. Chỉ chạy một bài tại một thời điểm.
@MainActor
final class CatalogPublishQueue: ObservableObject {
    @Published private(set) var jobs: [CatalogPublishJob] = []
    @Published private(set) var loadError: String?
    @Published private(set) var isRestoring = false
    @Published private(set) var cancellingIDs: Set<String> = []
    private(set) var donorId: String?

    private let store: CatalogPublishStore
    private let transport: any CatalogPublishTransport
    private var worker: Task<Void, Never>?
    private var restoration: Task<Void, Never>?
    private var generation = UUID()
    private var retrying: Set<String> = []

    init(store: CatalogPublishStore, transport: any CatalogPublishTransport) {
        self.store = store
        self.transport = transport
    }

    func setUser(_ userId: String?) {
        guard donorId != userId else { return }
        worker?.cancel()
        worker = nil
        restoration?.cancel()
        generation = UUID()
        donorId = userId
        jobs = []
        retrying = []
        loadError = nil
        isRestoring = userId != nil
        guard let userId else { return }
        let token = generation
        restoration = Task { [weak self] in
            guard let self else { return }
            do {
                var restored = try await self.store.load(donorId: userId)
                try self.checkSession(token)
                for index in restored.indices where restored[index].state != .failed {
                    restored[index].state = .queued
                    restored[index].errorMessage = nil
                }
                self.jobs = restored
            } catch {
                guard self.generation == token else { return }
                self.loadError = "Không đọc được bản chờ đăng. Dữ liệu vẫn được giữ trên máy; hãy mở lại app để thử lại."
            }
            guard self.generation == token else { return }
            self.isRestoring = false
            self.startWorker()
        }
    }

    /// Chỉ trả về sau khi bản chờ và ảnh đã nằm trên đĩa, không chờ mạng.
    func enqueue(_ job: CatalogPublishJob, images: [Data], thumbnail: Data) async throws {
        let token = generation
        await restoration?.value
        try checkSession(token, owner: job.payload.donorId)
        try await store.create(job, images: images, thumbnail: thumbnail)
        try checkSession(token, owner: job.payload.donorId)
        jobs.append(job)
        startWorker()
    }

    func retry(_ id: String) async {
        guard let index = jobs.firstIndex(where: { $0.id == id && $0.state == .failed && $0.cancellationRequested != true }),
              !cancellingIDs.contains(id),
              retrying.insert(id).inserted else { return }
        defer { retrying.remove(id) }
        let token = generation
        var job = jobs[index]
        job.state = .queued
        job.errorMessage = nil
        do {
            try await store.save(job)
            try checkSession(token, owner: job.payload.donorId)
            replace(job)
            startWorker()
        } catch {
            guard generation == token else { return }
            loadError = "Chưa thể lưu yêu cầu thử lại. Nội dung và ảnh vẫn được giữ trên máy."
        }
    }

    func resume() { startWorker() }

    func cancel(_ id: String) async {
        guard var job = jobs.first(where: { $0.id == id && $0.state == .failed }),
              !retrying.contains(id), cancellingIDs.insert(id).inserted else { return }
        // Không xoá set này khi đổi tài khoản: đăng nhập lại cùng chủ cũng phải chờ cleanup cũ xong.
        defer { cancellingIDs.remove(id) }
        let token = generation
        job.cancellationRequested = true
        job.errorMessage = "Chưa hoàn tất huỷ bản chờ. Vui lòng thử huỷ lại khi sẵn sàng."
        do {
            try checkSession(token, owner: job.payload.donorId)
            try await store.save(job)
            try checkSession(token)
            replace(job)
            try await transport.cleanup(job)
            try checkSession(token, owner: job.payload.donorId)
            try await store.remove(job)
            try checkSession(token)
            jobs.removeAll { $0.id == id }
        } catch {
            guard generation == token, !Task.isCancelled else { return }
            if case CatalogPublishQueueError.alreadyPublished = error {
                job.cancellationRequested = nil
            }
            let message = Self.failureMessage(error)
            job.errorMessage = "Chưa huỷ được bản chờ. \(message) Nội dung vẫn được giữ trên máy."
            do { try await store.save(job) }
            catch { if generation == token { loadError = "Chưa lưu được trạng thái huỷ. Bản chờ vẫn được giữ trên máy." } }
            guard generation == token else { return }
            replace(job)
        }
    }

    func discardDrafts(donorId: String) async throws {
        if self.donorId == donorId { setUser(nil) }
        let stored = try await store.load(donorId: donorId)
        for job in stored { try await store.remove(job) }
    }

    func thumbnail(for job: CatalogPublishJob) async -> Data? {
        guard donorId == job.payload.donorId else { return nil }
        return try? await store.thumbnail(for: job)
    }

    var publishedIDs: [String] { jobs.filter { $0.state == .published }.map(\.id) }

    func acknowledgePublished(_ ids: Set<String>) {
        jobs.removeAll { $0.state == .published && ids.contains($0.id) }
    }

    private func startWorker() {
        guard donorId != nil, !isRestoring, worker == nil, jobs.contains(where: { $0.state == .queued }) else { return }
        let token = generation
        worker = Task { [weak self] in
            guard let self else { return }
            while self.generation == token, !Task.isCancelled,
                  let job = self.jobs.first(where: { $0.state == .queued }) {
                await self.process(job, token: token)
            }
            if self.generation == token { self.worker = nil }
        }
    }

    private func process(_ initial: CatalogPublishJob, token: UUID) async {
        do {
            try checkSession(token, owner: initial.payload.donorId)
            var job = initial
            job.state = .uploading
            try await store.save(job)
            try checkSession(token)
            replace(job)
            let images = try await store.images(for: job)
            try checkSession(token)
            try await transport.upload(images, job: job) { [weak self] index, asset in
                guard let self else { throw CancellationError() }
                try self.checkSession(token, owner: initial.payload.donorId)
                guard var latest = self.jobs.first(where: { $0.id == initial.id }),
                      latest.uploaded.indices.contains(index) else { throw CatalogPublishQueueError.invalidDraft }
                latest.uploaded[index] = asset
                try await self.store.save(latest)
                try self.checkSession(token)
                self.replace(latest)
            }
            try checkSession(token)
            guard var ready = jobs.first(where: { $0.id == initial.id }),
                  ready.completedImageCount == ready.imageClientIDs.count else {
                throw CatalogPublishQueueError.missingImage
            }
            ready.state = .saving
            try await store.save(ready)
            try checkSession(token)
            replace(ready)
            try await transport.publish(ready)
            try checkSession(token)
            try await store.remove(ready)
            try checkSession(token)
            ready.state = .published
            replace(ready)
        } catch {
            guard generation == token, !Task.isCancelled,
                  var latest = jobs.first(where: { $0.id == initial.id }) else { return }
            latest.state = .failed
            latest.errorMessage = Self.failureMessage(error)
            do { try await store.save(latest) }
            catch { if generation == token { loadError = "Chưa lưu được trạng thái lỗi. Bản chờ gốc vẫn ở trên máy." } }
            guard generation == token, !Task.isCancelled else { return }
            replace(latest)
        }
    }

    private func replace(_ job: CatalogPublishJob) {
        guard let index = jobs.firstIndex(where: { $0.id == job.id }) else { return }
        jobs[index] = job
    }

    private static func failureMessage(_ error: Error) -> String {
        if (error as NSError).domain == NSURLErrorDomain {
            return "Mất kết nối mạng. Hãy thử lại khi có mạng."
        }
        return (error as? LocalizedError)?.errorDescription
            ?? "Không thể hoàn tất thao tác. Vui lòng thử lại sau hoặc liên hệ hỗ trợ."
    }

    private func checkSession(_ token: UUID, owner: String? = nil) throws {
        try Task.checkCancellation()
        guard generation == token, donorId != nil, owner == nil || donorId == owner else {
            throw CatalogPublishQueueError.accountChanged
        }
    }
}
