const { ApiError } = require('./image-api.cjs');

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

  async function decide(donationId, headers, body) {
    const staff = await authenticateStaff(headers);
    const { action, publicMessage, internalNote, expectedVersion } = body || {};

    if (!['approve', 'reject', 'information'].includes(action)) {
      throw new ApiError(400, 'Invalid appraisal action. Must be approve, reject, or information.');
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

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(donationRef);
      if (!doc.exists) {
        throw new ApiError(404, 'Donation not found');
      }
      const data = doc.data();

      // Warehouse authorization check
      const assignedWarehouse = data.hubId || data.warehouseId;
      if (staff.role === 'warehouse_admin') {
        if (!assignedWarehouse || !staff.warehouseIds.includes(assignedWarehouse)) {
          throw new ApiError(403, 'You are not authorized to appraise donations for this warehouse.');
        }
      }

      // Concurrency and state check
      if (data.status !== 'pending') {
        throw new ApiError(409, `Donation is already in ${data.status} state.`);
      }
      if (data.reviewState === 'needs_information' && action === 'information') {
        throw new ApiError(409, 'Donation is already awaiting information from donor.');
      }
      if (expectedVersion !== undefined && data.version !== expectedVersion) {
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
        internalNote: cleanInternalNote || null,
        reviewedBy: staff.uid,
        reviewedAt: (serverTimestamp ? serverTimestamp() : new Date()),
        version: nextVersion,
        history: [...(data.history || []), historyEntry],
      };

      transaction.update(donationRef, updateData);

      // Inventory check: AC5 specifies that approval MUST NOT increase inventory.
      // We explicitly ensure no writes are made to inventory collections.

      return {
        id: donationId,
        ...data,
        ...updateData,
      };
    });

    return {
      status: 200,
      body: {
        status: 'success',
        donation: result,
      },
    };
  }

  async function get(donationId, headers) {
    const staff = await authenticateStaff(headers);
    const doc = await db.collection('donations').doc(donationId).get();
    if (!doc.exists) throw new ApiError(404, 'Donation not found');
    const data = doc.data();
    const assignedWarehouse = data.hubId || data.warehouseId;
    if (staff.role === 'warehouse_admin' && (!assignedWarehouse || !staff.warehouseIds.includes(assignedWarehouse))) {
      throw new ApiError(403, 'Forbidden: not your assigned warehouse');
    }
    return {
      status: 200,
      body: { donation: { id: doc.id, ...data } },
    };
  }

  async function handle(method, path, headers, body) {
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
