const AUDIT_COLLECTION = 'p2p_listing_audit';
const MAX_REPORTS_PER_REMOVAL = 100;

function readRemovalReports(tx, db, id) {
  return tx.get(db.collection('reports').where('targetId', '==', id).limit(MAX_REPORTS_PER_REMOVAL));
}

function applyListingRemoval(tx, { ref, data, reports, auditRef, actor, reason, timestamp, previousStatus, aiModeration }) {
  // Báo cáo đang khoá tài khoản dở giữ nguyên để admin hoàn tất ở trang Báo cáo vi phạm.
  const open = reports.docs.filter(report => {
    const item = report.data();
    return item.targetType === 'listing' && item.status === 'open' && !item.pendingAction;
  });
  tx.update(ref, {
    status: 'removed',
    moderation: {
      source: actor.source, action: 'remove', reason, previousStatus,
      moderatedBy: actor.uid, moderatedAt: timestamp,
      ...(aiModeration ? { categories: aiModeration.categories, confidence: aiModeration.confidence, model: aiModeration.model } : {}),
    },
    ...(aiModeration ? { aiModeration } : {}),
  });
  const sourceLabel = actor.source === 'ai' ? 'Gỡ tự động bởi AI' : 'Gỡ từ trang Kho đồ 0đ';
  const note = (reason ? `${sourceLabel}: ${reason}` : sourceLabel).slice(0, 500);
  for (const report of open) {
    tx.update(report.ref, {
      status: 'resolved', resolution: 'remove_listing', resolutionNote: note,
      resolvedBy: actor.uid, resolvedAt: timestamp,
    });
  }
  tx.create(auditRef, {
    action: 'remove', listingId: ref.id, title: data.title || '', district: data.district || '',
    donorId: data.donorId || null, previousStatus, reason, resolvedReportIds: open.map(report => report.id),
    actorUid: actor.uid, actorEmail: actor.email, actorRole: actor.role, createdAt: timestamp,
  });
  return open.length;
}

module.exports = { AUDIT_COLLECTION, readRemovalReports, applyListingRemoval };
