//
//  FirestoreService.swift
//  ReShare
//
//  Dịch vụ giao tiếp Cloud Firestore cho Sprint 1 (User Management)
//

import Foundation
import FirebaseFirestore

/// Giao thức trừu tượng hóa dịch vụ Firestore
protocol FirestoreServiceProtocol {
    func createUserProfile(_ profile: UserProfile) async throws
    func fetchUserProfile(userId: String) async throws -> UserProfile
    func updateUserProfile(userId: String, displayName: String, phoneNumber: String) async throws -> UserProfile

}

final class FirestoreService: FirestoreServiceProtocol {
    static let shared = FirestoreService()

    private init() {}

    private var db: Firestore {
        Firestore.firestore()
    }

    // MARK: - User Management

    /// Tạo thông tin UserProfile mới trong collection "users"
    func createUserProfile(_ profile: UserProfile) async throws {
        let encoded = try Firestore.Encoder().encode(profile)
        let reference = db.collection(Constants.FirestoreCollections.users).document(profile.id)
        _ = try await db.runTransaction { transaction, errorPointer -> Any? in
            do {
                let document = try transaction.getDocument(reference)
                guard !document.exists else {
                    errorPointer?.pointee = NSError(domain: "ReShare.Profile", code: 409, userInfo: [NSLocalizedDescriptionKey: "Hồ sơ đã tồn tại."])
                    return nil
                }
                transaction.setData(encoded, forDocument: reference)
                return true
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
    }

    /// Lấy thông tin UserProfile theo UID từ Firestore (Bảo vệ không tạo đè nếu lỗi mạng)
    func fetchUserProfile(userId: String) async throws -> UserProfile {
        let doc = try await db.collection(Constants.FirestoreCollections.users)
            .document(userId)
            .getDocument()

        guard doc.exists else {
            throw NSError(domain: "ReShare.Profile", code: 404, userInfo: [NSLocalizedDescriptionKey: "Hồ sơ người dùng không tồn tại"])
        }
        return try doc.data(as: UserProfile.self)
    }

    /// Chỉ tạo hồ sơ donor khi Firestore xác nhận tài liệu chưa tồn tại.
    /// Transaction tránh ghi đè hồ sơ vừa được tạo bởi một thiết bị khác.
    func fetchOrCreateDonorProfile(userId: String) async throws -> UserProfile {
        do {
            return try await fetchUserProfile(userId: userId)
        } catch let error as NSError where error.domain == "ReShare.Profile" && error.code == 404 {
            guard let email = AuthService.shared.currentEmail, !email.isEmpty else {
                throw NSError(domain: "ReShare.Profile", code: 400, userInfo: [NSLocalizedDescriptionKey: "Tài khoản không có email để khôi phục hồ sơ."])
            }
            let name = email.split(separator: "@").first.map(String.init) ?? "Người dùng ReShare"
            let profile = UserProfile(id: userId, email: email, displayName: name, phoneNumber: "", role: .donor, createdAt: Date())
            let encoded = try Firestore.Encoder().encode(profile)
            let reference = db.collection(Constants.FirestoreCollections.users).document(userId)
            _ = try await db.runTransaction { transaction, errorPointer -> Any? in
                do {
                    let document = try transaction.getDocument(reference)
                    if !document.exists {
                        transaction.setData(encoded, forDocument: reference)
                    }
                    return true
                } catch {
                    errorPointer?.pointee = error as NSError
                    return nil
                }
            }
            return try await fetchUserProfile(userId: userId)
        }
    }

    func updateUserProfile(userId: String, displayName: String, phoneNumber: String) async throws -> UserProfile {
        let reference = db.collection(Constants.FirestoreCollections.users).document(userId)
        let result = try await db.runTransaction { transaction, errorPointer -> Any? in
            do {
                let document = try transaction.getDocument(reference)
                guard document.exists else {
                    errorPointer?.pointee = NSError(domain: "ReShare.Profile", code: 404, userInfo: [NSLocalizedDescriptionKey: "Hồ sơ người dùng không tồn tại."])
                    return nil
                }
                var profile = try document.data(as: UserProfile.self)
                profile.displayName = displayName
                profile.phoneNumber = phoneNumber
                transaction.updateData(["displayName": displayName, "phoneNumber": phoneNumber], forDocument: reference)
                return profile
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
        guard let profile = result as? UserProfile else {
            throw NSError(domain: "ReShare.Profile", code: 500, userInfo: [NSLocalizedDescriptionKey: "Không thể xác nhận hồ sơ đã lưu."])
        }
        return profile
    }

}
