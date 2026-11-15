// A locking failure must never make a successfully taken suspension disappear without resuming it.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { withSuspendLock } from '../src/core/suspend.js';

const originals = Object.fromEntries(['navigator', 'indexedDB'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const set = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('an IndexedDB abort after taking a suspension still returns the taken battle', async () => {
  set('navigator', {});
  set('indexedDB', { open() {
    const request = {}, tx = { objectStore() { return { get() {
      const read = {};
      queueMicrotask(() => { read.onsuccess(); tx.onabort(); });
      return read;
    } }; }, abort() { queueMicrotask(() => tx.onabort?.()); } };
    queueMicrotask(() => { request.result = { transaction: () => tx, close() {} }; request.onsuccess(); });
    return request;
  } });
  let battle = 'saved battle';
  const result = await withSuspendLock(() => { const record = battle; battle = null; return { record }; });
  assert.deepEqual(result, { record: 'saved battle' });
  assert.equal(battle, null);
});

test('existing suspension operations work when both lock APIs are unavailable', async () => {
  set('navigator', {}); set('indexedDB', undefined);
  let battle = 'saved battle';
  const result = await withSuspendLock(() => { const record = battle; battle = null; return { record }; }, { legacyFallback: true });
  assert.deepEqual(result, { record: 'saved battle' });
  assert.equal(battle, null);
});

test('existing suspension operations still work when the IndexedDB lock store cannot open', async () => {
  set('navigator', {});
  set('indexedDB', { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { transaction() { throw new Error('lock store unavailable'); }, close() {} };
      request.onsuccess();
    });
    return request;
  } });
  let battle = 'saved battle';
  const result = await withSuspendLock(() => { const record = battle; battle = null; return { record }; }, { legacyFallback: true });
  assert.deepEqual(result, { record: 'saved battle' });
  assert.equal(battle, null);
});

test('new quick-load discard does not run without any available lock', async () => {
  set('navigator', {}); set('indexedDB', undefined);
  let battle = 'saved battle';
  const result = await withSuspendLock(() => { battle = null; return 'dropped'; });
  assert.equal(result, 'failed');
  assert.equal(battle, 'saved battle');
});
