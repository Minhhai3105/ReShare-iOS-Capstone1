import Foundation

/// Mỗi bài có thư mục riêng; manifest chỉ xuất hiện sau khi tất cả ảnh đã được lưu.
actor CatalogPublishStore {
    private let root: URL

    init(root: URL) { self.root = root }

    func create(_ job: CatalogPublishJob, images: [Data], thumbnail: Data) throws {
        try validate(job)
        guard images.count == job.imageClientIDs.count, images.allSatisfy({ !$0.isEmpty }) else {
            throw CatalogPublishQueueError.invalidDraft
        }
        let directory = try directory(for: job.id)
        guard !FileManager.default.fileExists(atPath: directory.path) else {
            throw CatalogPublishQueueError.duplicateDraft
        }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var resources = URLResourceValues()
        resources.isExcludedFromBackup = true
        var rootURL = root
        try rootURL.setResourceValues(resources)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        do {
            for (index, data) in images.enumerated() {
                try write(data, to: directory.appendingPathComponent("\(index).jpg"))
            }
            try write(thumbnail, to: directory.appendingPathComponent("thumbnail.jpg"))
            try save(job)
        } catch {
            // Thư mục vừa tạo chưa được giao cho hàng đợi; form vẫn giữ ảnh để người dùng thử lại.
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    func load(donorId: String) throws -> [CatalogPublishJob] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        let directories = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        return try directories.compactMap { directory in
            let manifest = directory.appendingPathComponent("job.json")
            guard FileManager.default.fileExists(atPath: manifest.path) else { return nil }
            let job = try JSONDecoder().decode(CatalogPublishJob.self, from: Data(contentsOf: manifest))
            try validate(job)
            guard job.id == directory.lastPathComponent else { throw CatalogPublishQueueError.invalidDraft }
            guard job.payload.donorId == donorId else { return nil }
            #if os(iOS)
            // Cập nhật cả ảnh/manifest của bản chờ được tạo bởi bản app trước.
            for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
            }
            #endif
            return job
        }.sorted { $0.createdAt < $1.createdAt }
    }

    func save(_ job: CatalogPublishJob) throws {
        try validate(job)
        try write(JSONEncoder().encode(job), to: directory(for: job.id).appendingPathComponent("job.json"))
    }

    func images(for job: CatalogPublishJob) throws -> [Data] {
        try validate(job)
        return try job.imageClientIDs.indices.map { index in
            let data = try Data(contentsOf: directory(for: job.id).appendingPathComponent("\(index).jpg"))
            guard !data.isEmpty else { throw CatalogPublishQueueError.missingImage }
            return data
        }
    }

    func thumbnail(for job: CatalogPublishJob) throws -> Data {
        try validate(job)
        return try Data(contentsOf: directory(for: job.id).appendingPathComponent("thumbnail.jpg"))
    }

    func remove(_ job: CatalogPublishJob) throws {
        let url = try directory(for: job.id)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    private func validate(_ job: CatalogPublishJob) throws {
        _ = try directory(for: job.id)
        guard !job.payload.donorId.isEmpty, !job.payload.title.isEmpty,
              (3...6).contains(job.imageClientIDs.count),
              job.uploaded.count == job.imageClientIDs.count,
              Set(job.imageClientIDs).count == job.imageClientIDs.count,
              job.imageClientIDs.allSatisfy({ UUID(uuidString: $0) != nil }) else {
            throw CatalogPublishQueueError.invalidDraft
        }
    }

    private func directory(for id: String) throws -> URL {
        guard id.hasPrefix("cat_"), UUID(uuidString: String(id.dropFirst(4))) != nil else {
            throw CatalogPublishQueueError.invalidDraft
        }
        return root.appendingPathComponent(id, isDirectory: true)
    }

    private func write(_ data: Data, to url: URL) throws {
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
