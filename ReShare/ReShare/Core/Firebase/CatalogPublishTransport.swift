import Foundation
import UIKit
import FirebaseAuth
import FirebaseFirestore

extension CatalogPublishQueue {
    static let shared = CatalogPublishQueue(
        store: CatalogPublishStore(root: URL.applicationSupportDirectory.appendingPathComponent("CatalogPublishQueue", isDirectory: true)),
        transport: FirebaseCatalogPublishTransport()
    )

    func enqueue(_ job: CatalogPublishJob, images: [UIImage]) async throws {
        let prepared = try await Task.detached(priority: .userInitiated) {
            let jpeg = try images.map { try CloudinaryImageService.prepareJPEG($0, maxPixelDimension: 2048) }
            guard let first = images.first else { throw CatalogPublishQueueError.missingImage }
            let thumbnail = try CloudinaryImageService.prepareJPEG(first, maxPixelDimension: 320)
            return (jpeg, thumbnail)
        }.value
        try await enqueue(job, images: prepared.0, thumbnail: prepared.1)
    }
}

@MainActor
private final class FirebaseCatalogPublishTransport: CatalogPublishTransport {
    func upload(
        _ images: [Data], job: CatalogPublishJob,
        onUploaded: @escaping @MainActor (Int, CatalogPublishAsset) async throws -> Void
    ) async throws {
        do { try await uploadImages(images, job: job, onUploaded: onUploaded) }
        catch { throw mappedError(error) }
    }

    func publish(_ job: CatalogPublishJob) async throws {
        do { try await publishItem(job) }
        catch { throw mappedError(error) }
    }

    func cleanup(_ job: CatalogPublishJob) async throws {
        do {
            try checkUser(job)
            try await CloudinaryImageService.shared.deletePendingCatalogImages(
                recordId: job.id, expectedUserId: job.payload.donorId
            )
        } catch {
            if case CloudinaryImageError.serverRejected(409) = error {
                throw CatalogPublishQueueError.alreadyPublished
            }
            throw mappedError(error)
        }
    }

    private func uploadImages(
        _ images: [Data], job: CatalogPublishJob,
        onUploaded: @escaping @MainActor (Int, CatalogPublishAsset) async throws -> Void
    ) async throws {
        try checkUser(job)
        let missing = job.uploaded.indices.filter { job.uploaded[$0] == nil }
        guard !missing.isEmpty else { return }
        _ = try await CloudinaryImageService.shared.uploadPreparedImages(
            missing.map { images[$0] }, purpose: .catalogItem, recordId: job.id,
            clientImageIDs: missing.map { job.imageClientIDs[$0] },
            expectedUserId: job.payload.donorId, cleanupOnFailure: false,
            onUploaded: { index, image in
                guard let url = image.secureURL else { throw CloudinaryImageError.invalidServerResponse }
                try await onUploaded(missing[index], CatalogPublishAsset(publicId: image.publicId, secureURL: url))
            }
        )
    }

    private func publishItem(_ job: CatalogPublishJob) async throws {
        try checkUser(job)
        let assets = job.uploaded.compactMap { $0 }
        guard assets.count == job.imageClientIDs.count else { throw CatalogPublishQueueError.missingImage }
        let payload = job.payload
        let item = CatalogItem(
            id: job.id, donorId: payload.donorId, donorName: payload.donorName,
            title: payload.title, category: payload.category, condition: payload.condition,
            district: payload.district, timeAgo: "Vừa xong", imageName: payload.imageName,
            status: .available, pickupAddress: payload.pickupAddress, donorNote: payload.donorNote,
            createdAt: Date(), imageUrl: assets.first?.secureURL,
            images: assets.map(\.secureURL), imageProvider: "cloudinary", imagePublicIds: assets.map(\.publicId)
        )
        // API hiện có dùng cùng document ID và createIfAbsent khi thử lại sau khi mất phản hồi.
        try await FirestoreService.shared.publishCatalogItem(item)
    }

    private func checkUser(_ job: CatalogPublishJob) throws {
        try Task.checkCancellation()
        guard AuthService.shared.currentUserId == job.payload.donorId else {
            throw CatalogPublishQueueError.accountChanged
        }
    }

    private func mappedError(_ error: Error) -> Error {
        if case CloudinaryImageError.signedOut = error { return CatalogPublishQueueError.sessionExpired }
        if case CloudinaryImageError.serverRejected(401) = error { return CatalogPublishQueueError.sessionExpired }
        if case CloudinaryImageError.serverRejected(403) = error { return CatalogPublishQueueError.permissionDenied }
        let nsError = error as NSError
        if nsError.domain == FirestoreErrorDomain {
            if nsError.code == FirestoreErrorCode.permissionDenied.rawValue { return CatalogPublishQueueError.permissionDenied }
            if nsError.code == FirestoreErrorCode.unauthenticated.rawValue { return CatalogPublishQueueError.sessionExpired }
        }
        if nsError.domain == AuthErrorDomain {
            if nsError.code == AuthErrorCode.userDisabled.rawValue { return CatalogPublishQueueError.permissionDenied }
            if [AuthErrorCode.invalidUserToken, .userTokenExpired, .userNotFound].contains(where: { $0.rawValue == nsError.code }) {
                return CatalogPublishQueueError.sessionExpired
            }
        }
        return error
    }
}
