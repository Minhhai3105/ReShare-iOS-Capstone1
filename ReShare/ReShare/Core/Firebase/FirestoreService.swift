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
    
    // MARK: - Kênh 2: Quyên góp tập trung về Trạm
    func createDonation(_ item: DonationItem) async throws
    func fetchMyDonations(donorId: String) async throws -> [DonationItem]
    func fetchRecentDonations(donorId: String?, limit: Int) async throws -> [DonationItem]
    
    // MARK: - Kênh 1: Kho đồ 0đ Cộng đồng (P2P Catalog)
    func publishCatalogItem(_ item: CatalogItem) async throws
    func fetchCatalogItems() async throws -> [CatalogItem]
    func reserveCatalogItem(
        chatId: String,
        itemId: String,
        operatorUserId: String,
        reservationMessage: ChatMessageItem,
        conversationHeader: ChatConversation
    ) async throws
    func cancelReservation(
        chatId: String,
        itemId: String,
        operatorUserId: String,
        cancelMessage: ChatMessageItem
    ) async throws
    
    // MARK: - Quản lý cuộc hẹn & Bàn giao 2 bên
    func proposeAppointment(
        chatId: String,
        proposalMessage: ChatMessageItem,
        conversationHeader: ChatConversation
    ) async throws
    
    func acceptAppointment(
        chatId: String,
        itemId: String,
        donorId: String,
        proposalMessageId: String,
        pickupTime: Date,
        conversationHeader: ChatConversation
    ) async throws
    
    func declineAppointment(
        chatId: String,
        proposalMessageId: String,
        donorId: String
    ) async throws
    
    func confirmHandover(
        chatId: String,
        itemId: String,
        actorId: String
    ) async throws -> Bool
    
    // MARK: - Kênh Chat 1-1 Realtime
    func sendMessage(chatId: String, message: ChatMessageItem, conversationHeader: ChatConversation?) async throws
    func observeMessages(chatId: String, onUpdate: @escaping ([ChatMessageItem]) -> Void) -> ListenerRegistration
    func observeUserConversations(userId: String, onUpdate: @escaping ([ChatConversation]) -> Void) -> ListenerRegistration
    func observeConversation(chatId: String, onUpdate: @escaping (ChatConversation?) -> Void) -> ListenerRegistration
    func observeItem(itemId: String, onUpdate: @escaping (CatalogItem?) -> Void) -> ListenerRegistration
    func saveConversationHeader(_ conversation: ChatConversation) async throws
    func markConversationAsRead(chatId: String, userId: String, messageTime: Date) async throws
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
    
    // MARK: - Donation Operations (Kênh 2)
    
    /// Đẩy đơn quyên góp mới lên collection "donations" (Chờ server xác nhận)
    func createDonation(_ item: DonationItem) async throws {
        let encoded = try Firestore.Encoder().encode(item)
        let reference = db.collection(Constants.FirestoreCollections.donations).document(item.id)
        try await createIfAbsent(reference, donorId: item.donorId, title: item.title, imagePublicIds: item.imagePublicIds, data: encoded)
    }
    
    /// Lấy danh sách lịch sử quyên góp của chính người dùng hiện tại
    func fetchMyDonations(donorId: String) async throws -> [DonationItem] {
        let snapshot = try await db.collection(Constants.FirestoreCollections.donations)
            .whereField("donorId", isEqualTo: donorId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        
        return snapshot.documents.compactMap { document in
            try? document.data(as: DonationItem.self)
        }
    }
    
    /// Lấy các đơn quyên góp gần đây của người dùng hiện tại (khớp security rules)
    func fetchRecentDonations(donorId: String? = nil, limit: Int = 5) async throws -> [DonationItem] {
        let targetDonorId = donorId ?? AuthService.shared.currentUserId
        guard let uid = targetDonorId, !uid.isEmpty else { return [] }
        let snapshot = try await db.collection(Constants.FirestoreCollections.donations)
            .whereField("donorId", isEqualTo: uid)
            .order(by: "createdAt", descending: true)
            .limit(to: limit)
            .getDocuments()
        
        return snapshot.documents.compactMap { doc in
            try? doc.data(as: DonationItem.self)
        }
    }
    
    // MARK: - Catalog Operations (Kênh 1: Kho đồ 0đ P2P)
    
    /// Đăng món đồ 0đ mới lên Kho cộng đồng Đà Nẵng (Chờ server xác nhận)
    func publishCatalogItem(_ item: CatalogItem) async throws {
        let encoded = try Firestore.Encoder().encode(item)
        let reference = db.collection(Constants.FirestoreCollections.catalogItems).document(item.id)
        try await createIfAbsent(reference, donorId: item.donorId, title: item.title, imagePublicIds: item.imagePublicIds, data: encoded)
    }

    /// Retry sau khi mất phản hồi ghi: nếu document đúng chủ và đúng bộ ảnh đã tồn tại, không ghi đè trạng thái mới.
    private func createIfAbsent(_ reference: DocumentReference, donorId: String, title: String, imagePublicIds: [String]?, data: [String: Any]) async throws {
        _ = try await db.runTransaction { transaction, errorPointer -> Any? in
            do {
                let snapshot = try transaction.getDocument(reference)
                if let existing = snapshot.data() {
                    guard existing["donorId"] as? String == donorId,
                          existing["title"] as? String == title,
                          (existing["imagePublicIds"] as? [String]) == imagePublicIds else {
                        errorPointer?.pointee = NSError(
                            domain: "ReShare",
                            code: 409,
                            userInfo: [NSLocalizedDescriptionKey: "Mã đơn hoặc bài đăng đã được dùng cho nội dung khác."]
                        )
                        return nil
                    }
                    return true
                }
                transaction.setData(data, forDocument: reference)
                return true
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
    }
    
    /// Lấy danh sách toàn bộ món đồ 0đ đang được chia sẻ tại Đà Nẵng
    func fetchCatalogItems() async throws -> [CatalogItem] {
        let snapshot = try await db.collection(Constants.FirestoreCollections.catalogItems)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        
        return snapshot.documents.compactMap { doc in
            try? doc.data(as: CatalogItem.self)
        }
    }
    
    /// Chốt lịch hẹn / Giữ đồ nguyên tử (Atomic Transaction) chống Race Condition
    func reserveCatalogItem(
        chatId: String,
        itemId: String,
        operatorUserId: String,
        reservationMessage: ChatMessageItem,
        conversationHeader: ChatConversation
    ) async throws {
        let itemRef = db.collection(Constants.FirestoreCollections.catalogItems).document(itemId)
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let msgRef = convRef.collection(Constants.FirestoreCollections.messages).document(reservationMessage.id)
        
        _ = try await db.runTransaction { (transaction, errorPointer) -> Any? in
            // 1. Kiểm tra người thao tác có thuộc cuộc trò chuyện hay không
            guard conversationHeader.participantIds.contains(operatorUserId) else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 403,
                    userInfo: [NSLocalizedDescriptionKey: "Bạn không có quyền thao tác trên cuộc trò chuyện này."]
                )
                return nil
            }
            
            // 2. Đọc document món đồ
            let itemDoc: DocumentSnapshot
            do {
                itemDoc = try transaction.getDocument(itemRef)
            } catch let err as NSError {
                errorPointer?.pointee = err
                return nil
            }
            
            guard let itemData = itemDoc.data() else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Món đồ không tồn tại trên hệ thống."]
                )
                return nil
            }
            
            // 3. Khớp chủ sở hữu
            let itemDonorId = (itemData["donorId"] as? String) ?? ""
            guard itemDonorId == conversationHeader.donorId else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 400,
                    userInfo: [NSLocalizedDescriptionKey: "Chủ sở hữu món đồ không khớp với hội thoại."]
                )
                return nil
            }
            
            // 4. Kiểm tra trạng thái khả dụng và chưa bị giữ
            let rawStatus = (itemData["status"] as? String) ?? ""
            let isAvailable = (rawStatus == CatalogItemStatus.available.rawValue || rawStatus == "Sẵn sàng nhận đồ")
            let alreadyReserved = itemData["reservedChatId"] != nil
            
            guard isAvailable && !alreadyReserved else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 409,
                    userInfo: [NSLocalizedDescriptionKey: "Món đồ này vừa được người khác giữ trước bạn!"]
                )
                return nil
            }
            
            // 5. Chuẩn bị dữ liệu an toàn
            let msgDict: [String: Any]
            let headerDict: [String: Any]
            do {
                msgDict = try Firestore.Encoder().encode(reservationMessage)
                var header = conversationHeader
                header.isReserved = true
                header.lastMessage = reservationMessage.text
                header.lastMessageTime = reservationMessage.createdAt
                header.lastSenderId = operatorUserId
                var encodedHeader = try Firestore.Encoder().encode(header)
                encodedHeader.removeValue(forKey: "lastReadTimes")
                headerDict = encodedHeader
            } catch let encodeErr as NSError {
                errorPointer?.pointee = encodeErr
                return nil
            }
            
            // 6. Cập nhật trạng thái chuẩn
            transaction.updateData([
                "status": CatalogItemStatus.reserved.rawValue,
                "reservedChatId": chatId,
                "reservedRequesterId": conversationHeader.requesterId
            ], forDocument: itemRef)
            
            transaction.setData(headerDict, forDocument: convRef, merge: true)
            transaction.setData(msgDict, forDocument: msgRef)
            return nil
        }
    }
    
    /// Hủy lịch hẹn / Mở lại trạng thái sẵn sàng cho món đồ qua Atomic Transaction
    func cancelReservation(
        chatId: String,
        itemId: String,
        operatorUserId: String,
        cancelMessage: ChatMessageItem
    ) async throws {
        let itemRef = db.collection(Constants.FirestoreCollections.catalogItems).document(itemId)
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let msgRef = convRef.collection(Constants.FirestoreCollections.messages).document(cancelMessage.id)
        
        _ = try await db.runTransaction { (transaction, errorPointer) -> Any? in
            let itemDoc: DocumentSnapshot
            do {
                itemDoc = try transaction.getDocument(itemRef)
            } catch let err as NSError {
                errorPointer?.pointee = err
                return nil
            }
            
            guard let itemData = itemDoc.data() else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Món đồ không tồn tại trên hệ thống."]
                )
                return nil
            }
            
            // 1. Kiểm tra reservedChatId có đúng là chatId này không
            let currentReservedChatId = itemData["reservedChatId"] as? String
            guard currentReservedChatId == chatId else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 403,
                    userInfo: [NSLocalizedDescriptionKey: "Món đồ không được giữ bởi cuộc trò chuyện này, bạn không thể hủy."]
                )
                return nil
            }
            
            // 2. Kiểm tra người gọi có quyền hủy không (chủ món đồ hoặc người đang được giữ đồ)
            let donorId = (itemData["donorId"] as? String) ?? ""
            let reservedRequesterId = (itemData["reservedRequesterId"] as? String) ?? ""
            guard operatorUserId == donorId || operatorUserId == reservedRequesterId else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 403,
                    userInfo: [NSLocalizedDescriptionKey: "Bạn không có quyền hủy lịch hẹn cho món đồ này."]
                )
                return nil
            }

            let donorConfirmed = (itemData["donorHandoverConfirmed"] as? Bool) ?? false
            let requesterConfirmed = (itemData["requesterHandoverConfirmed"] as? Bool) ?? false
            guard !donorConfirmed && !requesterConfirmed else {
                errorPointer?.pointee = NSError(
                    domain: "ReShare",
                    code: 409,
                    userInfo: [NSLocalizedDescriptionKey: "Đã có người xác nhận bàn giao; không thể hủy lịch hẹn."]
                )
                return nil
            }
            
            let msgDict: [String: Any]
            do {
                msgDict = try Firestore.Encoder().encode(cancelMessage)
            } catch let encodeErr as NSError {
                errorPointer?.pointee = encodeErr
                return nil
            }
            
            transaction.updateData([
                "status": CatalogItemStatus.available.rawValue,
                "reservedChatId": FieldValue.delete(),
                "reservedRequesterId": FieldValue.delete(),
                "pickupTime": FieldValue.delete(),
                "reservationDeadline": FieldValue.delete(),
                "donorHandoverConfirmed": false,
                "requesterHandoverConfirmed": false
            ], forDocument: itemRef)
            
            transaction.updateData([
                "isReserved": false,
                "appointmentStatus": "cancelled",
                "proposedPickupTime": FieldValue.delete(),
                "reservationDeadline": FieldValue.delete(),
                "donorHandoverConfirmed": false,
                "requesterHandoverConfirmed": false,
                "lastMessage": cancelMessage.text,
                "lastMessageTime": cancelMessage.createdAt,
                "lastSenderId": cancelMessage.senderId
            ], forDocument: convRef)
            
            transaction.setData(msgDict, forDocument: msgRef)
            return nil
        }
    }
    
    // MARK: - Quản lý cuộc hẹn & Bàn giao 2 bên
    
    /// Người nhận (B) gửi thẻ đề xuất hẹn giờ lấy đồ (Món đồ vẫn available để người khác chat)
    func proposeAppointment(
        chatId: String,
        proposalMessage: ChatMessageItem,
        conversationHeader: ChatConversation
    ) async throws {
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let msgRef = convRef.collection(Constants.FirestoreCollections.messages).document(proposalMessage.id)
        guard let appointmentTime = proposalMessage.appointmentTime else {
            throw NSError(domain: "ReShare", code: 400, userInfo: [NSLocalizedDescriptionKey: "Đề xuất chưa có thời gian hẹn."])
        }
        
        let msgData = try Firestore.Encoder().encode(proposalMessage)
        
        var header = conversationHeader
        header.lastMessage = proposalMessage.text
        header.lastMessageTime = proposalMessage.createdAt
        header.lastSenderId = proposalMessage.senderId
        header.appointmentStatus = "proposed"
        header.proposedPickupTime = appointmentTime
        
        var headerData = try Firestore.Encoder().encode(header)
        headerData.removeValue(forKey: "lastReadTimes")
        
        // Chỉ tạo toàn bộ header cho chat mới; chat cũ chỉ đổi các trường của đề xuất.
        _ = try await db.runTransaction { transaction, errorPointer -> Any? in
            do {
                let existing = try transaction.getDocument(convRef)
                if existing.exists {
                    transaction.updateData([
                        "lastMessage": proposalMessage.text,
                        "lastMessageTime": proposalMessage.createdAt,
                        "lastSenderId": proposalMessage.senderId,
                        "appointmentStatus": "proposed",
                        "proposedPickupTime": appointmentTime
                    ], forDocument: convRef)
                } else {
                    transaction.setData(headerData, forDocument: convRef)
                }
                transaction.setData(msgData, forDocument: msgRef)
                return true
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
    }
    
    /// Người cho (A) bấm "Đồng ý" đề xuất hẹn của B -> Chạy Atomic Transaction khóa đồ
    func acceptAppointment(
        chatId: String,
        itemId: String,
        donorId: String,
        proposalMessageId: String,
        pickupTime: Date,
        conversationHeader: ChatConversation
    ) async throws {
        let itemRef = db.collection(Constants.FirestoreCollections.catalogItems).document(itemId)
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let proposalMsgRef = convRef.collection(Constants.FirestoreCollections.messages).document(proposalMessageId)
        let sysMsgId = UUID().uuidString
        let sysMsgRef = convRef.collection(Constants.FirestoreCollections.messages).document(sysMsgId)
        
        let deadline = pickupTime.addingTimeInterval(2 * 3600) // Buffer 2 tiếng sau giờ hẹn
        
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm dd/MM"
        let pickupTimeStr = formatter.string(from: pickupTime)
        let deadlineStr = formatter.string(from: deadline)
        
        let systemMsg = ChatMessageItem(
            id: sysMsgId,
            senderId: donorId,
            senderName: conversationHeader.donorName,
            text: "🎉 Hai bên đã chốt lịch hẹn nhận đồ lúc \(pickupTimeStr) tại \(conversationHeader.itemPickupAddress). Hạn giữ đồ đến \(deadlineStr).",
            timeString: "Vừa xong",
            isCurrentUser: false,
            createdAt: Date(),
            messageType: "text"
        )
        
        _ = try await db.runTransaction { (transaction, errorPointer) -> Any? in
            let itemDoc: DocumentSnapshot
            do {
                itemDoc = try transaction.getDocument(itemRef)
            } catch let err as NSError {
                errorPointer?.pointee = err
                return nil
            }
            
            guard let itemData = itemDoc.data() else {
                errorPointer?.pointee = NSError(domain: "ReShare", code: 404, userInfo: [NSLocalizedDescriptionKey: "Món đồ không tồn tại trên hệ thống."])
                return nil
            }
            
            let currentStatus = (itemData["status"] as? String) ?? ""
            let isAvailable = (currentStatus == CatalogItemStatus.available.rawValue || currentStatus == "Sẵn sàng nhận đồ")
            let alreadyReserved = itemData["reservedChatId"] != nil
            
            guard isAvailable && !alreadyReserved else {
                errorPointer?.pointee = NSError(domain: "ReShare", code: 409, userInfo: [NSLocalizedDescriptionKey: "Món đồ này vừa được người khác giữ trước bạn!"])
                return nil
            }
            
            let itemDonorId = (itemData["donorId"] as? String) ?? ""
            guard itemDonorId == donorId else {
                errorPointer?.pointee = NSError(domain: "ReShare", code: 403, userInfo: [NSLocalizedDescriptionKey: "Chỉ chủ món đồ mới có quyền chấp nhận lịch hẹn."])
                return nil
            }
            
            let sysMsgDict: [String: Any]
            do {
                sysMsgDict = try Firestore.Encoder().encode(systemMsg)
            } catch let encodeErr as NSError {
                errorPointer?.pointee = encodeErr
                return nil
            }
            
            // 1. Cập nhật món đồ sang reserved kèm deadline và cờ bàn giao
            transaction.updateData([
                "status": CatalogItemStatus.reserved.rawValue,
                "reservedChatId": chatId,
                "reservedRequesterId": conversationHeader.requesterId,
                "pickupTime": pickupTime,
                "reservationDeadline": deadline,
                "donorHandoverConfirmed": false,
                "requesterHandoverConfirmed": false
            ], forDocument: itemRef)
            
            // 2. Cập nhật thẻ tin nhắn đề xuất sang accepted
            transaction.updateData([
                "appointmentStatus": "accepted"
            ], forDocument: proposalMsgRef)
            
            // 3. Cập nhật hội thoại
            transaction.updateData([
                "isReserved": true,
                "appointmentStatus": "accepted",
                "proposedPickupTime": pickupTime,
                "reservationDeadline": deadline,
                "donorHandoverConfirmed": false,
                "requesterHandoverConfirmed": false,
                "lastMessage": systemMsg.text,
                "lastMessageTime": systemMsg.createdAt,
                "lastSenderId": donorId
            ], forDocument: convRef)
            
            // 4. Tạo tin nhắn hệ thống
            transaction.setData(sysMsgDict, forDocument: sysMsgRef)
            return nil
        }
    }
    
    /// Người cho (A) từ chối đề xuất hẹn
    func declineAppointment(
        chatId: String,
        proposalMessageId: String,
        donorId: String
    ) async throws {
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let proposalMsgRef = convRef.collection(Constants.FirestoreCollections.messages).document(proposalMessageId)
        let sysMsgId = UUID().uuidString
        let sysMsgRef = convRef.collection(Constants.FirestoreCollections.messages).document(sysMsgId)
        
        let sysMsg = ChatMessageItem(
            id: sysMsgId,
            senderId: donorId,
            senderName: "Người cho",
            text: "⚠️ Người cho chưa tiện khung giờ này. Hai bạn vui lòng nhắn tin để chọn khung giờ khác nhé.",
            timeString: "Vừa xong",
            isCurrentUser: false,
            createdAt: Date(),
            messageType: "text"
        )
        let sysData = try Firestore.Encoder().encode(sysMsg)
        
        let batch = db.batch()
        batch.updateData(["appointmentStatus": "declined"], forDocument: proposalMsgRef)
        batch.updateData([
            "appointmentStatus": "declined",
            "lastMessage": sysMsg.text,
            "lastMessageTime": sysMsg.createdAt,
            "lastSenderId": donorId
        ], forDocument: convRef)
        batch.setData(sysData, forDocument: sysMsgRef)
        try await batch.commit()
    }
    
    /// Xác nhận bàn giao 2 bên (Cả 2 bên đều phải xác nhận mới hoàn tất món đồ)
    func confirmHandover(
        chatId: String,
        itemId: String,
        actorId: String
    ) async throws -> Bool {
        let itemRef = db.collection(Constants.FirestoreCollections.catalogItems).document(itemId)
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let sysMsgId = UUID().uuidString
        let sysMsgRef = convRef.collection(Constants.FirestoreCollections.messages).document(sysMsgId)
        
        let result = try await db.runTransaction { (transaction, errorPointer) -> Any? in
            let itemDoc: DocumentSnapshot
            do {
                itemDoc = try transaction.getDocument(itemRef)
            } catch let err as NSError {
                errorPointer?.pointee = err
                return nil
            }
            
            guard let itemData = itemDoc.data() else {
                errorPointer?.pointee = NSError(domain: "ReShare", code: 404, userInfo: [NSLocalizedDescriptionKey: "Món đồ không tồn tại."])
                return nil
            }
            
            let donorId = (itemData["donorId"] as? String) ?? ""
            let reservedRequesterId = (itemData["reservedRequesterId"] as? String) ?? ""
            
            guard actorId == donorId || actorId == reservedRequesterId else {
                errorPointer?.pointee = NSError(domain: "ReShare", code: 403, userInfo: [NSLocalizedDescriptionKey: "Bạn không có quyền xác nhận bàn giao cho món đồ này."])
                return nil
            }
            
            var donorConfirmed = (itemData["donorHandoverConfirmed"] as? Bool) ?? false
            var requesterConfirmed = (itemData["requesterHandoverConfirmed"] as? Bool) ?? false
            
            if actorId == donorId {
                donorConfirmed = true
            } else if actorId == reservedRequesterId {
                requesterConfirmed = true
            }
            
            let bothConfirmed = donorConfirmed && requesterConfirmed
            let sysText: String
            
            if bothConfirmed {
                sysText = "🎉 Giao dịch hoàn tất! Cả hai bên đã xác nhận trao và nhận đồ thành công 100% 0đ tại Đà Nẵng. Cảm ơn bạn đã lan tỏa tinh thần sẻ chia vì cộng đồng!"
                
                transaction.updateData([
                    "status": CatalogItemStatus.completed.rawValue,
                    "donorHandoverConfirmed": true,
                    "requesterHandoverConfirmed": true
                ], forDocument: itemRef)
                
                transaction.updateData([
                    "isReserved": false,
                    "appointmentStatus": "completed",
                    "donorHandoverConfirmed": true,
                    "requesterHandoverConfirmed": true,
                    "lastMessage": sysText,
                    "lastMessageTime": Date(),
                    "lastSenderId": actorId
                ], forDocument: convRef)
            } else {
                if actorId == donorId {
                    sysText = "📦 Người cho đã bấm xác nhận đã trao đồ. Đang chờ người nhận xác nhận đã nhận đồ (1/2)."
                } else {
                    sysText = "📦 Người nhận đã bấm xác nhận đã nhận đồ. Đang chờ người cho xác nhận đã trao đồ (1/2)."
                }
                
                transaction.updateData([
                    "donorHandoverConfirmed": donorConfirmed,
                    "requesterHandoverConfirmed": requesterConfirmed
                ], forDocument: itemRef)
                
                transaction.updateData([
                    "donorHandoverConfirmed": donorConfirmed,
                    "requesterHandoverConfirmed": requesterConfirmed,
                    "lastMessage": sysText,
                    "lastMessageTime": Date(),
                    "lastSenderId": actorId
                ], forDocument: convRef)
            }
            
            let sysMsg = ChatMessageItem(
                id: sysMsgId,
                senderId: actorId,
                senderName: actorId == donorId ? "Người cho" : "Người nhận",
                text: sysText,
                timeString: "Vừa xong",
                isCurrentUser: false,
                createdAt: Date(),
                messageType: "text"
            )
            
            if let sysDict = try? Firestore.Encoder().encode(sysMsg) {
                transaction.setData(sysDict, forDocument: sysMsgRef)
            }
            
            return bothConfirmed
        }
        
        return (result as? Bool) ?? false
    }
    
    // MARK: - Chat 1-1 Realtime Operations
    
    /// Gửi tin nhắn mới vào phòng chat 1-1 và cập nhật document hội thoại cha (Đồng bộ chờ server xác nhận)
    func sendMessage(chatId: String, message: ChatMessageItem, conversationHeader: ChatConversation? = nil) async throws {
        let msgData = try Firestore.Encoder().encode(message)
        let convRef = db.collection(Constants.FirestoreCollections.conversations).document(chatId)
        let msgRef = convRef.collection(Constants.FirestoreCollections.messages).document(message.id)
        var newHeaderData: [String: Any]?
        if var header = conversationHeader {
            header.lastMessage = message.text
            header.lastMessageTime = message.createdAt
            header.lastSenderId = message.senderId
            var headerData = try Firestore.Encoder().encode(header)
            headerData.removeValue(forKey: "lastReadTimes")
            newHeaderData = headerData
        }

        // Transaction đọc chat trước, tránh header cũ ghi đè trạng thái hẹn và thời điểm đọc.
        _ = try await db.runTransaction { transaction, errorPointer -> Any? in
            do {
                let existing = try transaction.getDocument(convRef)
                if existing.exists {
                    transaction.updateData([
                        "lastMessage": message.text,
                        "lastMessageTime": message.createdAt,
                        "lastSenderId": message.senderId
                    ], forDocument: convRef)
                } else if let newHeaderData {
                    transaction.setData(newHeaderData, forDocument: convRef)
                } else {
                    errorPointer?.pointee = NSError(
                        domain: "ReShare",
                        code: 404,
                        userInfo: [NSLocalizedDescriptionKey: "Hội thoại không tồn tại."]
                    )
                    return nil
                }
                transaction.setData(msgData, forDocument: msgRef)
                return true
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
    }
    
    /// Lưu / Cập nhật header cuộc trò chuyện
    func saveConversationHeader(_ conversation: ChatConversation) async throws {
        let encoded = try Firestore.Encoder().encode(conversation)
        try await db.collection(Constants.FirestoreCollections.conversations)
            .document(conversation.id)
            .setData(encoded, merge: true)
    }
    
    /// Đánh dấu đã đọc cuộc trò chuyện bằng cách cập nhật atomic trường lastReadTimes của riêng người đọc
    func markConversationAsRead(chatId: String, userId: String, messageTime: Date) async throws {
        try await db.collection(Constants.FirestoreCollections.conversations)
            .document(chatId)
            .updateData([
                "lastReadTimes.\(userId)": messageTime
            ])
    }
    
    /// Lắng nghe danh sách tất cả các cuộc trò chuyện của một người dùng (cả người cho và người nhận)
    func observeUserConversations(userId: String, onUpdate: @escaping ([ChatConversation]) -> Void) -> ListenerRegistration {
        return db.collection(Constants.FirestoreCollections.conversations)
            .whereField("participantIds", arrayContains: userId)
            .addSnapshotListener { snapshot, error in
                guard let documents = snapshot?.documents, error == nil else {
                    return
                }
                
                let convs = documents.compactMap { doc -> ChatConversation? in
                    try? doc.data(as: ChatConversation.self)
                }.sorted { $0.lastMessageTime > $1.lastMessageTime }
                
                onUpdate(convs)
            }
    }
    
    /// Lắng nghe luồng tin nhắn thời gian thực qua Firestore Snapshot Listener
    func observeMessages(chatId: String, onUpdate: @escaping ([ChatMessageItem]) -> Void) -> ListenerRegistration {
        return db.collection(Constants.FirestoreCollections.conversations)
            .document(chatId)
            .collection(Constants.FirestoreCollections.messages)
            .order(by: "createdAt", descending: false)
            .addSnapshotListener { snapshot, error in
                guard let documents = snapshot?.documents, error == nil else {
                    return
                }
                
                let msgs = documents.compactMap { doc -> ChatMessageItem? in
                    try? doc.data(as: ChatMessageItem.self)
                }
                onUpdate(msgs)
            }
    }
    
    /// Lắng nghe thông tin 1 cuộc trò chuyện thời gian thực
    func observeConversation(chatId: String, onUpdate: @escaping (ChatConversation?) -> Void) -> ListenerRegistration {
        return db.collection(Constants.FirestoreCollections.conversations)
            .document(chatId)
            .addSnapshotListener { snapshot, error in
                guard let snapshot = snapshot, snapshot.exists, error == nil else {
                    onUpdate(nil)
                    return
                }
                let conv = try? snapshot.data(as: ChatConversation.self)
                onUpdate(conv)
            }
    }
    
    /// Lắng nghe trạng thái 1 món đồ thời gian thực
    func observeItem(itemId: String, onUpdate: @escaping (CatalogItem?) -> Void) -> ListenerRegistration {
        return db.collection(Constants.FirestoreCollections.catalogItems)
            .document(itemId)
            .addSnapshotListener { snapshot, error in
                guard let snapshot = snapshot, snapshot.exists, error == nil else {
                    onUpdate(nil)
                    return
                }
                let item = try? snapshot.data(as: CatalogItem.self)
                onUpdate(item)
            }
    }
}
