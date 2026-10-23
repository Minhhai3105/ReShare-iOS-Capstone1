const { ApiError } = require('./image-api.cjs');
const { FieldValue } = require('firebase-admin/firestore');

function publicHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(entry => Object.fromEntries(
    ['action', 'fromStatus', 'toStatus', 'reviewState', 'timestamp', 'publicMessage', 'version']
      .filter(key => entry && entry[key] !== undefined)
      .map(key => [key, entry[key]])
  ));
}

function createDonationReviewApi({ db, verifyToken, serverTimestamp }) {
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
    await db.runTransaction(async transaction => {
      const [donationDoc, warehouseDoc, reviewDoc] = await Promise.all([
        transaction.get(donationRef), transaction.get(warehouseRef), transaction.get(reviewRef),
      ]);
      if (!donationDoc.exists) throw new ApiError(404, 'Donation not found');
      const donation = donationDoc.data();
      if (!warehouseDoc.exists) throw new ApiError(404, 'Warehouse not found');
      if (warehouseDoc.data().status !== 'active') {
        throw new ApiError(400, 'Warehouse is not active');
      }
      if (donation.warehouseId) {
        throw new ApiError(409, 'Donation is already assigned to a warehouse');
      }
      if (donation.status !== 'pending') {
        throw new ApiError(409, `Donation must be pending to assign warehouse (current status: ${donation.status})`);
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

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(donationRef);
      if (!doc.exists) {
        throw new ApiError(404, 'Donation not found');
      }
      const data = doc.data();
      const reviewDoc = await transaction.get(reviewRef);
      const previousReviews = reviewDoc.exists && Array.isArray(reviewDoc.data().history)
        ? reviewDoc.data().history
        : (Array.isArray(data.history) ? data.history : []);

      // Warehouse authorization check
      const assignedWarehouse = data.warehouseId;
      if (staff.role === 'warehouse_admin') {
        if (!assignedWarehouse || !staff.warehouseIds.includes(assignedWarehouse)) {
          throw new ApiError(403, 'You are not authorized to appraise donations for this warehouse.');
        }
      }

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
        history: [...publicHistory(data.history), publicHistory([historyEntry])[0]],
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
    await db.runTransaction(async transaction => {
      const donationDoc = await transaction.get(donationRef);
      if (!donationDoc.exists) throw new ApiError(404, 'Donation not found');
      const donation = donationDoc.data();
      if (staff.role === 'warehouse_admin' &&
          (!donation.warehouseId || !staff.warehouseIds.includes(donation.warehouseId))) {
        throw new ApiError(403, 'Forbidden: not your assigned warehouse');
      }
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
    return {
      status: 200,
      body: { donation: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
        donor: {
          name: donor.displayName || data.donorName || data.donorId || 'Người gửi',
          email: donor.email || null,
        },
        internalNote: review.internalNote || null,
        reviewedBy: review.reviewedBy || null,
        staffConfirmedCategory: review.staffConfirmedCategory || null,
        staffConfirmedBy: review.staffConfirmedBy || null,
        staffConfirmedAt: review.staffConfirmedAt?.toDate?.().toISOString() ||
          (review.staffConfirmedAt instanceof Date ? review.staffConfirmedAt.toISOString() : (review.staffConfirmedAt || null)),
        staffConfirmationVersion: review.staffConfirmationVersion || 0,
        warehouseAssignedBy: review.warehouseAssignedBy || null,
        warehouseAssignedAt: review.warehouseAssignedAt?.toDate?.().toISOString() ||
          (review.warehouseAssignedAt instanceof Date ? review.warehouseAssignedAt.toISOString() : (review.warehouseAssignedAt || null)),
        categoryConfirmationHistory: review.categoryConfirmationHistory || [],
        history: review.history || data.history || [],
      } },
    };
  }

  async function handle(method, path, headers, body) {
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
