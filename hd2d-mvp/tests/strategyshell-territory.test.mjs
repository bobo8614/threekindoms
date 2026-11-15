// Exercise the session-only toggle and quality switches without starting the game or a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStrategyShell } from '../src/strategyshell.js';

function map() {
  let territoryOn = false, roadsOn = false, game = null; const paints = [];
  return {
    month: 0, paints,
    refresh(g) { game = g; if (territoryOn) paints.push(g.owner); },
    territory(on) { territoryOn = on; if (on && game) paints.push(game.owner); },
    get territoryOn() { return territoryOn; },
    roads(on) { roadsOn = on; }, get roadsOn() { return roadsOn; },
    setSeason(month) { this.month = month; }, select() {}, pickMode() {}, hover() {}, release() {},
  };
}

test('territory follows the session across map switches and defers changes while off', async () => {
  const flat = map(), three = map(), shell = await createStrategyShell({ flat: async () => flat, load3d: async () => three, ctx: {}, start: '3d' });
  const g = { owner: 1 }; shell.refresh(g);
  assert.equal(shell.territoryOn, false); assert.deepEqual(three.paints, []);
  shell.territory(true); assert.deepEqual(three.paints, [1]);
  await shell.use('flat'); assert.equal(shell.territoryOn, true); assert.deepEqual(flat.paints, [1]);
  shell.territory(false); g.owner = 2; shell.refresh(g);
  assert.deepEqual(flat.paints, [1]);
  await shell.use('3d');
  assert.equal(shell.territoryOn, false); assert.deepEqual(three.paints, [1], 'the hidden map is disabled before it receives the new owner');
  shell.territory(true); assert.deepEqual(three.paints, [1, 2], 'first enable sees the latest owner');
  const fresh = await createStrategyShell({ flat: async () => map(), load3d: async () => map(), ctx: {}, start: '3d' });
  assert.equal(fresh.territoryOn, false, 'another session starts off');
});
