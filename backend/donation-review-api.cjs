const { ApiError } = require('./image-api.cjs');
const { FieldValue } = require('firebase-admin/firestore');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess } = require('./staff-access.cjs');
const { staffEmails } = require('./staff-emails.cjs');
const { publicHistory, mergeDonationHistory } = require('./donation-history.cjs');

function donationSender(data, profile = {}) {
  const name = [profile.displayName, data.donorName]
    .find(value => typeof value === 'string' && value.trim() && value.trim() !== data.donorId);
  return {
    name: name?.trim() || 'Chưa cập nhật tên',
    email: typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim() : null,
  };
}

function createDonationReviewApi({ db, auth, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Donation Review API configuration is incomplete');

  async function authenticateStaff(headers) {
    const match = /^Bearer (\S+)$/.exec(headers.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');

    const assignmentDoc = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignmentDoc.exists || assignmentDoc.data().active !== true) {
      throw new ApiError(403, 'Active staff assignment required');
    }
    const data = assignmentDoc.data();
    if (!['system_admin', 'warehouse_admin'].includes(data.role)) {
      throw new ApiError(403, 'Insufficient permissions');
    }
    return {
      uid: claims.uid,
      role: data.role,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [],
    };
  }

  async function assignWarehouse(donationId, headers, body) {
    const staff = await authenticateStaff(headers);
    if (staff.role !== 'system_admin') throw new ApiError(403, 'System Admin access required');
    const warehouseId = body?.warehouseId;
    const expectedVersion = body?.expectedVersion;
    if (typeof warehouseId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(warehouseId) ||
        !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApiError(400, 'Valid warehouse and donation version are required');
    }

    const donationRef = db.collection('donations').doc(donationId);
    const warehouseRef = db.collection('warehouses').doc(warehouseId);
    const reviewRef = db.collection('donation_reviews').doc(donationId);
    await runTransaction(db, async transaction => {
      const [donationDoc, warehouseDoc, reviewDoc] = await Promise.all([
        transaction.get(donationRef), transaction.get(warehouseRef), transaction.get(reviewRef),
      ]);
      // Phân kho chỉ System Admin làm được; kiểm lại ngay trong transaction.
      await assertCurrentStaffAccess(transaction, db, staff.uid, { warehouseId, systemOnly: true });
      if (!donationDoc.exists) throw new ApiError(404, 'Donation not found');
      const donation = donationDoc.data();
      if (!warehouseDoc.exists) throw new ApiError(404, 'Warehouse not found');
      if (warehouseDoc.data().status !== 'active') {
        throw new ApiError(400, 'Warehouse is not active');
      }
      if (donation.warehouseId) {
        throw new ApiError(409, 'Donation is already assigned to a warehouse');
      }
      // Đơn đã duyệt mà chưa có kho (dữ liệu tạo trước khi chặn duyệt-không-kho) vẫn phải gán được,
      // nếu không sẽ kẹt: không ai thực nhận hay nhập kho được.
      if (!['pending', 'approved'].includes(donation.status)) {
        throw new ApiError(409, `Donation must be pending or approved to assign warehouse (current status: ${donation.status})`);
      }
      if (donation.reviewState === 'needs_information') {
        throw new ApiError(409, 'Donation is awaiting information from donor');
      }
      if ((donation.version || 1) !== expectedVersion) {
        throw new ApiError(409, 'Donation version has changed. Please reload before assigning.');
      }
      const assignedAt = serverTimestamp ? serverTimestamp() : new Date();
      transaction.update(donationRef, { warehouseId, version: expectedVersion + 1 });
      transaction.set(reviewRef, {
        ...(reviewDoc.exists ? reviewDoc.data() : {}),
        donationId,
        warehouseId,
        warehouseAssignedBy: staff.uid,
        warehouseAssignedAt: assignedAt,
      });
    });
    return { status: 200, body: { donation: (await get(donationId, headers)).body.donation } };
  }

  async function decide(donationId, headers, body) {
    const staff = await authenticateStaff(headers);
    const { action, publicMessage, internalNote, expectedVersion } = body || {};

    if (!['approve', 'reject', 'information'].includes(action)) {
      throw new ApiError(400, 'Invalid appraisal action. Must be approve, reject, or information.');
    }

    if ((publicMessage !== undefined && typeof publicMessage !== 'string') ||
        (internalNote !== undefined && typeof internalNote !== 'string')) {
      throw new ApiError(400, 'Messages must be strings.');
    }

    if ((action === 'reject' || action === 'information') && (!publicMessage || !publicMessage.trim())) {
      throw new ApiError(400, action === 'reject'
        ? 'Public rejection reason is required for the donor.'
        : 'Information request message is required for the donor.');
    }

    if (publicMessage && publicMessage.length > 1000) {
      throw new ApiError(400, 'Public message must not exceed 1000 characters.');
    }
    if (internalNote && internalNote.length > 2000) {
      throw new ApiError(400, 'Internal note must not exceed 2000 characters.');
    }

    const donationRef = db.collection('donations').doc(donationId);
    const reviewRef = db.collection('donation_reviews').doc(donationId);

    const result = await runTransaction(db, async (transaction) => {
      const doc = await transaction.get(donationRef);
      if (!doc.exists) {
        throw new ApiError(404, 'Donation not found');
      }
      const data = doc.data();
      const reviewDoc = await transaction.get(reviewRef);
      const previousReviews = mergeDonationHistory(data.history, reviewDoc.exists ? reviewDoc.data().history : []);

      // Warehouse authorization check
      const assignedWarehouse = data.warehouseId;
      if (staff.role === 'warehouse_admin') {
        if (!assignedWarehouse || !staff.warehouseIds.includes(assignedWarehouse)) {
          throw new ApiError(403, 'You are not authorized to appraise donations for this warehouse.');
        }
      }
      // Kiểm ở trên dùng quyền đọc trước transaction; lần đọc lại này mới là lần quyết định.
      await assertCurrentStaffAccess(transaction, db, staff.uid, { warehouseId: assignedWarehouse });

      // Concurrency and state check
      if (data.status !== 'pending') {
        throw new ApiError(409, `Donation is already in ${data.status} state.`);
      }
      if (data.reviewState === 'needs_information') {
        throw new ApiError(409, 'Donation is awaiting information from donor.');
      }
      if (expectedVersion !== undefined && (data.version || 1) !== expectedVersion) {
        throw new ApiError(409, 'Donation was updated by another staff member. Please reload before deciding.');
      }
      // Duyệt mà chưa có kho thì không ai thực nhận được; buộc gán kho trước.
      if (action === 'approve' && !assignedWarehouse) {
        throw new ApiError(409, 'Assign a warehouse before approving this donation.');
      }

      const nextVersion = (data.version || 1) + 1;
      const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
      const newReviewState = action === 'information' ? 'needs_information' : null;
      const cleanPublicMessage = (publicMessage || '').trim();
      const cleanInternalNote = (internalNote || '').trim();

      const historyEntry = {
        action,
        fromStatus: data.status,
        toStatus: newStatus,
        reviewState: newReviewState,
        actorUid: staff.uid,
        timestamp: new Date().toISOString(),
        publicMessage: cleanPublicMessage || null,
        internalNote: cleanInternalNote || null,
        version: nextVersion,
      };

      const updateData = {
        status: newStatus,
        reviewState: newReviewState,
        statusNote: cleanPublicMessage || null,
        reviewedAt: (serverTimestamp ? serverTimestamp() : new Date()),
        version: nextVersion,
        history: publicHistory([...previousReviews, historyEntry]),
      };

      // Firestore returns a complete document to its donor. Remove legacy private fields.
      if (Object.hasOwn(data, 'internalNote')) updateData.internalNote = FieldValue.delete();
      if (Object.hasOwn(data, 'reviewedBy')) updateData.reviewedBy = FieldValue.delete();

      transaction.update(donationRef, updateData);
      transaction.set(reviewRef, {
        ...(reviewDoc.exists ? reviewDoc.data() : {}),
        donationId,
        internalNote: cleanInternalNote || null,
        reviewedBy: staff.uid,
        reviewedAt: updateData.reviewedAt,
        history: [...previousReviews, historyEntry],
      });

      // Inventory check: AC5 specifies that approval MUST NOT increase inventory.
      // We explicitly ensure no writes are made to inventory collections.

      return { id: donationId, version: nextVersion };
    });

    return {
      status: 200,
      body: {
        status: 'success',
        donation: (await get(result.id, headers)).body.donation,
      },
    };
  }

  async function confirmCategory(donationId, headers, body) {
    const staff = await authenticateStaff(headers);
    const category = body?.category;
    const expectedVersion = body?.expectedVersion;
    if (!['clothing', 'books', 'household'].includes(category) ||
        !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new ApiError(400, 'Valid category and confirmation version are required');
    }

    const donationRef = db.collection('donations').doc(donationId);
    const reviewRef = db.collection('donation_reviews').doc(donationId);
    await runTransaction(db, async transaction => {
      const donationDoc = await transaction.get(donationRef);
      if (!donationDoc.exists) throw new ApiError(404, 'Donation not found');
      const donation = donationDoc.data();
      if (staff.role === 'warehouse_admin' &&
          (!donation.warehouseId || !staff.warehouseIds.includes(donation.warehouseId))) {
        throw new ApiError(403, 'Forbidden: not your assigned warehouse');
      }
      await assertCurrentStaffAccess(transaction, db, staff.uid, { warehouseId: donation.warehouseId });
      const reviewDoc = await transaction.get(reviewRef);
      const review = reviewDoc.exists ? reviewDoc.data() : {};
      const currentVersion = review.staffConfirmationVersion || 0;
      if (currentVersion !== expectedVersion) {
        throw new ApiError(409, 'Category confirmation changed. Reload before saving.');
      }
      const confirmedAt = new Date();
      transaction.set(reviewRef, {
        ...review,
        donationId,
        warehouseId: donation.warehouseId || null,
        aiPredictedCategory: donation.aiPredictedCategory || null,
        aiModelVersion: donation.aiModelVersion || null,
        staffConfirmedCategory: category,
        staffConfirmedBy: staff.uid,
        staffConfirmedAt: confirmedAt,
        staffConfirmationVersion: currentVersion + 1,
        categoryConfirmationHistory: [
          ...(Array.isArray(review.categoryConfirmationHistory) ? review.categoryConfirmationHistory : []),
          { category, actorUid: staff.uid, at: confirmedAt.toISOString(), version: currentVersion + 1 },
        ],
      });
    });
    return { status: 200, body: { donation: (await get(donationId, headers)).body.donation } };
  }

  async function aiSummary(headers) {
    const staff = await authenticateStaff(headers);
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection('donation_reviews')
      .orderBy('staffConfirmedAt', 'desc').limit(500).get();
    let confirmedCount = 0;
    let sampleCount = 0;
    let matchingCount = 0;
    for (const doc of snapshot.docs) {
      const review = doc.data();
      const confirmedAt = review.staffConfirmedAt?.toDate?.() || new Date(review.staffConfirmedAt);
      if (!Number.isFinite(confirmedAt.getTime()) || confirmedAt < from || confirmedAt > now) continue;
      if (staff.role === 'warehouse_admin' && !staff.warehouseIds.includes(review.warehouseId)) continue;
      if (!['clothing', 'books', 'household'].includes(review.staffConfirmedCategory)) continue;
      confirmedCount += 1;
      if (!['clothing', 'books', 'household'].includes(review.aiPredictedCategory)) continue;
      sampleCount += 1;
      if (review.aiPredictedCategory === review.staffConfirmedCategory) matchingCount += 1;
    }
    return { status: 200, body: {
      from: from.toISOString(), to: now.toISOString(), confirmedCount,
      sampleCount, matchingCount,
      agreementRate: sampleCount ? matchingCount / sampleCount : null,
      sampleLimit: 500,
      truncated: snapshot.docs.length === 500,
    } };
  }

  async function senders(headers, body) {
    const staff = await authenticateStaff(headers);
    const ids = body?.donationIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length ||
        !ids.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id))) {
      throw new ApiError(400, 'Provide 1 to 10 unique donation IDs');
    }
    // Keep the assignment, donation scope and private profiles in one consistent read.
    const result = await runTransaction(db, async transaction => {
      const assignment = await transaction.get(db.collection('staff_assignments').doc(staff.uid));
      const access = assignment.exists ? assignment.data() : {};
      if (access.active !== true || !['system_admin', 'warehouse_admin'].includes(access.role)) {
        throw new ApiError(403, 'Active staff assignment required');
      }
      const docs = await Promise.all(ids.map(id => transaction.get(db.collection('donations').doc(id))));
      if (docs.some(doc => !doc.exists)) throw new ApiError(404, 'Donation not found');
      if (access.role === 'warehouse_admin' && docs.some(doc =>
        !doc.data().warehouseId || !Array.isArray(access.warehouseIds) || !access.warehouseIds.includes(doc.data().warehouseId))) {
        throw new ApiError(403, 'Forbidden: not your assigned warehouse');
      }
      const donorIds = [...new Set(docs.map(doc => doc.data().donorId).filter(id =>
        typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/')))];
      const profiles = new Map(await Promise.all(donorIds.map(async id => {
        const profile = await transaction.get(db.collection('users').doc(id));
        return [id, profile.exists ? profile.data() : {}];
      })));
      return docs.map((doc, index) => ({ donationId: ids[index], donor: donationSender(doc.data(), profiles.get(doc.data().donorId)) }));
    });
    return { status: 200, body: { senders: result } };
  }

  async function get(donationId, headers) {
    const staff = await authenticateStaff(headers);
    const doc = await db.collection('donations').doc(donationId).get();
    if (!doc.exists) throw new ApiError(404, 'Donation not found');
    const data = doc.data();
    const assignedWarehouse = data.warehouseId;
    if (staff.role === 'warehouse_admin' && (!assignedWarehouse || !staff.warehouseIds.includes(assignedWarehouse))) {
      throw new ApiError(403, 'Forbidden: not your assigned warehouse');
    }
    const reviewDoc = await db.collection('donation_reviews').doc(donationId).get();
    const review = reviewDoc.exists ? reviewDoc.data() : {};
    const donorDoc = data.donorId ? await db.collection('users').doc(data.donorId).get() : null;
    const donor = donorDoc?.exists ? donorDoc.data() : {};
    const history = mergeDonationHistory(data.history, review.history);
    const emails = await staffEmails(auth, [review.staffConfirmedBy, review.warehouseAssignedBy,
      ...history.map(entry => entry?.actorUid)]);
    return {
      status: 200,
      body: { donation: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
        donor: donationSender(data, donor),
        internalNote: review.internalNote || null,
        reviewedBy: review.reviewedBy || null,
        staffConfirmedCategory: review.staffConfirmedCategory || null,
        staffConfirmedBy: review.staffConfirmedBy || null,
        staffConfirmedByEmail: emails.get(review.staffConfirmedBy) || null,
        staffConfirmedAt: review.staffConfirmedAt?.toDate?.().toISOString() ||
          (review.staffConfirmedAt instanceof Date ? review.staffConfirmedAt.toISOString() : (review.staffConfirmedAt || null)),
        staffConfirmationVersion: review.staffConfirmationVersion || 0,
        warehouseAssignedBy: review.warehouseAssignedBy || null,
        warehouseAssignedByEmail: emails.get(review.warehouseAssignedBy) || null,
        warehouseAssignedAt: review.warehouseAssignedAt?.toDate?.().toISOString() ||
          (review.warehouseAssignedAt instanceof Date ? review.warehouseAssignedAt.toISOString() : (review.warehouseAssignedAt || null)),
        categoryConfirmationHistory: review.categoryConfirmationHistory || [],
        history: history.map(entry => (emails.has(entry?.actorUid) ? { ...entry, actorEmail: emails.get(entry.actorUid) } : entry)),
      } },
    };
  }

  async function handle(method, path, headers, body) {
    if (path === '/v1/admin/donations/senders' && method === 'POST') {
      return senders(headers, body);
    }
    if (path === '/v1/admin/donations/ai-summary' && method === 'GET') {
      return aiSummary(headers);
    }
    const confirmMatch = /^\/v1\/admin\/donations\/([^/]+)\/confirm-category$/.exec(path);
    if (confirmMatch && method === 'POST') {
      return confirmCategory(confirmMatch[1], headers, body);
    }
    const assignMatch = /^\/v1\/admin\/donations\/([^/]+)\/assign-warehouse$/.exec(path);
    if (assignMatch && method === 'POST') {
      return assignWarehouse(assignMatch[1], headers, body);
    }
    const decideMatch = /^\/v1\/admin\/donations\/([^/]+)\/decide$/.exec(path);
    if (decideMatch && method === 'POST') {
      return decide(decideMatch[1], headers, body);
    }
    const getMatch = /^\/v1\/admin\/donations\/([^/]+)$/.exec(path);
    if (getMatch && method === 'GET') {
      return get(getMatch[1], headers);
    }
    throw new ApiError(404, 'Not found');
  }

  return { handle, decide, get };
}

module.exports = {
  createDonationReviewApi,
};
