const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess, requireSystemAdmin } = require('./staff-access.cjs');
const {
  ACCOUNT_MODERATION_LEASE_MS, disableAccountSignIn, moderationInProgress, prepareSuspensionWrites, readSuspensionTarget,
} = require('./account-suspension.cjs');

const BASE = '/v1/admin/users';
const VALID_UID = /^[A-Za-z0-9_-]{1,200}$/;
const PAGE_SIZE = 100;
const PROVIDERS = new Map([['password', 'email'], ['google.com', 'google']]);

function isoDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function createUsersAdminApi({ db, auth, verifyToken, serverTimestamp = () => new Date() }) {
  async function lookup(uid) {
    try { return await auth.getUser(uid); }
    catch (error) {
      if (error?.code === 'auth/user-not-found') throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      throw error;
    }
  }

  async function list(url) {
    const email = url.searchParams.get('email')?.trim() || '';
    const token = url.searchParams.get('pageToken') || undefined;
    if (email && (token || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new ApiError(400, 'Invalid email search', 'INVALID_EMAIL');
    }
    let page;
    if (email) {
      try { page = { users: [await auth.getUserByEmail(email)] }; }
      catch (error) {
        if (error?.code === 'auth/user-not-found') page = { users: [] };
        else throw error;
      }
    } else {
      try { page = await auth.listUsers(PAGE_SIZE, token); }
      catch (error) {
        if (error?.code === 'auth/invalid-page-token' || error?.code === 'auth/invalid-argument') {
          throw new ApiError(400, 'Invalid page token', 'INVALID_PAGE_TOKEN');
        }
        throw error;
      }
    }

    const refs = page.users.flatMap(({ uid }) => [db.doc(`users/${uid}`), db.doc(`staff_assignments/${uid}`)]);
    const docs = refs.length ? await db.getAll(...refs) : [];
    const byPath = new Map(docs.map(doc => [doc.ref.path, doc.data()]));
    const users = page.users.map(account => {
      const profile = byPath.get(`users/${account.uid}`);
      const staff = byPath.get(`staff_assignments/${account.uid}`);
      return {
        uid: account.uid,
        email: account.email || null,
        displayName: profile?.displayName || account.displayName || '',
        phoneNumber: profile?.phoneNumber || '',
        providers: [...new Set((account.providerData || []).map(provider => PROVIDERS.get(provider.providerId)).filter(Boolean))],
        createdAt: isoDate(account.metadata?.creationTime),
        lastSignInAt: isoDate(account.metadata?.lastSignInTime),
        disabled: account.disabled === true,
        suspended: profile?.suspended === true,
        suspendPending: profile?.suspendPending === true,
        unsuspendPending: profile?.unsuspendPending === true,
        staffRole: staff?.active === true ? staff.role : null,
      };
    });
    return { status: 200, body: { users, nextPageToken: page.pageToken || null } };
  }

  async function summary(uid) {
    await lookup(uid);
    const [donations, listings] = await Promise.all(['donations', 'catalog_items'].map(collection =>
      db.collection(collection).where('donorId', '==', uid).count().get()));
    return { status: 200, body: { donationCount: donations.data().count, listingCount: listings.data().count } };
  }

  async function finishSuspension(ref, leaseUntil, success) {
    return runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (doc.data()?.suspendLeaseUntil !== leaseUntil) return false;
      tx.update(ref, { suspendPending: !success, suspendLeaseUntil: null });
      return true;
    });
  }

  async function suspend(staff, uid, body) {
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500 || Object.keys(body).some(key => key !== 'reason')) {
      throw new ApiError(400, 'A reason between 1 and 500 characters is required', 'VALIDATION');
    }
    const account = await lookup(uid);
    const auditRef = db.collection('moderation_audit').doc();
    const { ref, leaseUntil } = await runTransaction(db, async tx => {
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      const profile = await readSuspensionTarget(tx, db, uid, { allowDirectRetry: true });
      const record = profile.data();
      const startedAt = Date.now();
      const until = startedAt + ACCOUNT_MODERATION_LEASE_MS;
      if (record?.suspendLeaseUntil > startedAt) throw moderationInProgress();
      if (record?.suspendPending === true) {
        tx.update(profile.ref, { suspendLeaseUntil: until });
      } else {
        if (record?.suspended === true) throw new ApiError(409, 'Account is already suspended', 'ALREADY_SUSPENDED');
        if (account.disabled) throw new ApiError(409, 'Account was disabled outside moderation', 'EXTERNAL_DISABLED');
        const timestamp = serverTimestamp();
        const source = 'users_page';
        // Auth có thể tồn tại trước lần tạo hồ sơ đầu tiên của app. Không để lại hồ sơ thiếu trường.
        const profileDefaults = profile.exists ? {} : {
          id: uid, email: account.email || '', role: 'donor',
          displayName: [...(account.displayName?.trim() || 'Người dùng ReShare')].slice(0, 80).join(''),
          phoneNumber: '', createdAt: timestamp,
        };
        const write = await prepareSuspensionWrites(tx, db, profile, {
          source, action: 'suspend_user', moderatedBy: staff.uid, moderatedAt: timestamp,
        }, { ...profileDefaults, suspendPending: true, suspendLeaseUntil: until });
        write();
        tx.create(auditRef, { action: 'suspend_user', source, targetUid: uid, actorUid: staff.uid, reason, createdAt: timestamp });
      }
      return { ref: profile.ref, leaseUntil: until };
    });

    try { await disableAccountSignIn(auth, uid); }
    catch (error) {
      await finishSuspension(ref, leaseUntil, false).catch(() => {});
      throw error;
    }
    if (!(await finishSuspension(ref, leaseUntil, true).catch(() => false))) {
      throw new ApiError(502, 'Account suspension is incomplete; retry to finish', 'SUSPEND_INCOMPLETE');
    }
    return { status: 200, body: { uid, suspended: true } };
  }

  async function handle(method, path, headers, body, requestUrl = '') {
    const match = /^\/v1\/admin\/users\/([^/]+)\/(summary|suspend)$/.exec(path);
    if (path !== BASE && !match) throw new ApiError(404, 'Not found');
    const staff = await requireSystemAdmin(db, verifyToken, headers);
    if (path === BASE && method === 'GET') return list(new URL(requestUrl || path, 'http://localhost'));
    if (match && !VALID_UID.test(match[1])) throw new ApiError(400, 'Invalid target user', 'VALIDATION');
    if (match?.[2] === 'summary' && method === 'GET') return summary(match[1]);
    if (match?.[2] === 'suspend' && method === 'POST') return suspend(staff, match[1], body);
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createUsersAdminApi };
