function publicHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(entry => Object.fromEntries(
    ['action', 'fromStatus', 'toStatus', 'reviewState', 'timestamp', 'publicMessage', 'version']
      .filter(key => entry && entry[key] !== undefined)
      .map(key => [key, entry[key]])
  ));
}

// Public events recover legacy gaps; private review fields win for the same transition.
function mergeDonationHistory(donationHistory, reviewHistory) {
  const events = new Map();
  for (const history of [donationHistory, reviewHistory]) {
    for (const entry of Array.isArray(history) ? history : []) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const key = Number.isSafeInteger(entry.version)
        ? `${entry.version}:${entry.action}`
        : JSON.stringify([entry.action, entry.timestamp, entry.fromStatus, entry.toStatus]);
      events.set(key, { ...events.get(key), ...entry });
    }
  }
  return [...events.values()].sort((left, right) =>
    Number.isSafeInteger(left.version) && Number.isSafeInteger(right.version)
      ? left.version - right.version : String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
}

module.exports = { publicHistory, mergeDonationHistory };
