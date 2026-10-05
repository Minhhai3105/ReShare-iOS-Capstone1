const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

test('contact and rate-limit documents are inaccessible to unauthenticated and authenticated clients', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const publicDb = env.unauthenticatedContext().firestore();
    const signedInDb = env.authenticatedContext('system-admin').firestore();

    for (const db of [publicDb, signedInDb]) {
      await assertFails(db.doc('contacts/contact-1').get());
      await assertFails(db.collection('contacts').get());
      await assertFails(db.doc('contacts/contact-1').set({
        name: 'Test',
        email: 'test@example.com',
        message: 'Test message',
      }));
      await assertFails(db.doc('contact_rate_limits/hash-1').get());
      await assertFails(db.doc('contact_rate_limits/hash-1').set({ timestampsMs: [] }));
    }
  } finally {
    await env.cleanup();
  }
});
