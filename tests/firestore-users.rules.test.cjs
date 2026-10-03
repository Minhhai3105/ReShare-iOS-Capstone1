const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

test('US01: owner can manage public profile, other users and privileged fields are denied', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const owner = env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();
    const other = env.authenticatedContext('bob', { email: 'bob@example.com' }).firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const profile = owner.doc('users/alice');
    const initial = {
      id: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      phoneNumber: '',
      role: 'donor',
      createdAt: new Date(),
    };

    await assertSucceeds(profile.set(initial));
    await assertSucceeds(profile.get());
    await assertSucceeds(profile.update({ displayName: 'Alice Nguyen', phoneNumber: '0901234567' }));

    await assertFails(other.doc('users/alice').get());
    await assertFails(other.doc('users/alice').update({ displayName: 'Bob' }));
    await assertFails(anonymous.doc('users/alice').get());
    await assertFails(owner.collection('users').get());
    await assertFails(profile.update({ role: 'system_admin' }));
    await assertFails(profile.update({ warehouseIds: ['warehouse-1'] }));
    await assertFails(profile.update({ email: 'other@example.com' }));
    await assertFails(profile.update({ createdAt: new Date() }));
    await assertFails(profile.delete());
    await assertFails(other.doc('users/bob').set({ ...initial, id: 'bob', email: 'bob@example.com', role: 'system_admin' }));
    await assertFails(other.doc('users/eve').set({ ...initial, id: 'eve', email: 'bob@example.com' }));
    await assertFails(
      env.authenticatedContext('charlie', { email: 'charlie@example.com' })
        .firestore()
        .doc('users/charlie')
        .set({ ...initial, id: 'charlie', email: 'charlie@example.com', warehouseIds: ['warehouse-1'] }),
    );
    await assertFails(
      env.authenticatedContext('dave', { email: 'dave@example.com' })
        .firestore()
        .doc('users/dave')
        .set({ ...initial, id: 'dave', email: 'someone-else@example.com' }),
    );
  } finally {
    await env.cleanup();
  }
});
