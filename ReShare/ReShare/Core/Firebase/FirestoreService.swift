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
}

final class FirestoreService: FirestoreServiceProtocol {
    static let shared = FirestoreService()
    
    private init() {}
    
    // MARK: - User Management
    
    /// Tạo thông tin UserProfile mới trong collection "users"
    func createUserProfile(_ profile: UserProfile) async throws {
        let db = Firestore.firestore()
        try db.collection(Constants.FirestoreCollections.users)
            .document(profile.id)
            .setData(from: profile)
    }
    
    /// Lấy thông tin UserProfile theo UID từ Firestore
    func fetchUserProfile(userId: String) async throws -> UserProfile {
        let db = Firestore.firestore()
        return try await db.collection(Constants.FirestoreCollections.users)
            .document(userId)
            .getDocument(as: UserProfile.self)
    }
}
