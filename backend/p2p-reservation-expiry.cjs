const { createHash } = require('node:crypto');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { runTransaction } = require('./firestore-transaction.cjs');

function createReservationExpiry({ db, now = () => Date.now(), batchSize = 100, intervalMs = 60000, onError = error => console.error('P2P expiry failed:', error.message) }) {
  let timer, running = false, resumeCursor = null;
  const millis = value => typeof value?.toMillis === 'function' ? value.toMillis() : value instanceof Date ? value.getTime() : NaN;

  async function expireOne(itemRef, cutoff) {
    return runTransaction(db, async tx => {
      const snapshot = await tx.get(itemRef);
      if (!snapshot.exists) return false;
      const item = snapshot.data();
      const deadline = millis(item.reservationDeadline);
      if (item.status !== 'reserved' || !Number.isFinite(deadline) || deadline > cutoff ||
          item.donorHandoverConfirmed || item.requesterHandoverConfirmed ||
          typeof item.reservedChatId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(item.reservedChatId)) return false;
      const chatRef = db.collection('conversations').doc(item.reservedChatId);
      const chatSnapshot = await tx.get(chatRef);
      if (!chatSnapshot.exists) return false;
      const chat = chatSnapshot.data();
      if (chat.itemId !== itemRef.id || chat.requesterId !== item.reservedRequesterId || chat.donorId !== item.donorId ||
          chat.donorHandoverConfirmed || chat.requesterHandoverConfirmed || chat.appointmentStatus !== 'accepted' ||
          millis(chat.reservationDeadline) !== deadline || millis(chat.proposedPickupTime) + 7200000 !== deadline) return false;
      const eventId = `expired_${createHash('sha256').update(`${itemRef.id}:${chatRef.id}:${deadline}`).digest('hex').slice(0, 40)}`;
      const at = Timestamp.fromMillis(cutoff);
      const text = 'Đã hết hạn giữ đồ sau giờ hẹn cộng 2 giờ. Chưa bên nào xác nhận bàn giao; món đồ đã mở lại cho người khác.';
      tx.update(itemRef, { status: 'available', reservedChatId: FieldValue.delete(), reservedRequesterId: FieldValue.delete(), pickupTime: FieldValue.delete(),
        reservationDeadline: FieldValue.delete(), donorHandoverConfirmed: false, requesterHandoverConfirmed: false });
      tx.update(chatRef, { isReserved: false, appointmentStatus: 'cancelled', proposedPickupTime: FieldValue.delete(),
        reservationDeadline: FieldValue.delete(), donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
        lastMessage: text, lastMessageTime: at, lastSenderId: 'system' });
      tx.set(chatRef.collection('messages').doc(eventId), { id: eventId, senderId: 'system', senderName: 'ReShare', text,
        createdAt: at, timeString: '', isCurrentUser: false, messageType: 'system' });
      return true;
    });
  }

  async function runOnce() {
    if (running) return { skipped: true, expired: 0 };
    running = true;
    try {
      const cutoff = now();
      // Quét các trang có cursor để reservation chờ đối soát không chặn các trang sau.
      let cursor = resumeCursor, expired = 0, scanned = 0;
      for (let page = 0; page < 10; page += 1) {
        let query = db.collection('catalog_items').where('status', '==', 'reserved')
          .where('donorHandoverConfirmed', '==', false).where('requesterHandoverConfirmed', '==', false)
          .where('reservationDeadline', '<=', Timestamp.fromMillis(cutoff)).orderBy('reservationDeadline').limit(batchSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        for (const item of snapshot.docs) { scanned += 1; if (await expireOne(item.ref, cutoff)) expired += 1; }
        if (snapshot.docs.length < batchSize) { resumeCursor = null; break; }
        cursor = snapshot.docs.at(-1);
        resumeCursor = cursor;
      }
      return { expired, scanned };
    } finally { running = false; }
  }

  function start() {
    if (timer) return;
    runOnce().catch(onError);
    timer = setInterval(() => runOnce().catch(onError), intervalMs);
    timer.unref?.();
  }
  return { runOnce, expireOne, start, stop() { clearInterval(timer); timer = null; } };
}

module.exports = { createReservationExpiry };
