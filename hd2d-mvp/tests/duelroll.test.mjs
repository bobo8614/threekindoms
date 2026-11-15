// The 单挑 blow as the original resolves it (`bank23:$BA15` then `$B8D3`): hit roll, damage spread and a missed 舍身's
// recoil read on from one table cursor; the striker's own 骂倒 adds 20 to the roll and 3/10 to the damage for 牵制,
// 攻击 and 舍身 alike; a damage byte of 128 or more skips the subtraction. The model below is the one
// tools/replay_skirmish_duel_core_probes.py holds the ROM's own code to (18,432 cases), over every cursor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG_TABLE as T } from '../src/core/origrng.js';
import { Duel } from '../src/core/skirmish.js';

const mk = (id, hp, F, atk, def) => ({ id, hp, F, o: { war: 50, int: 50, virtue: 50, loyalty: 50, hp: 90 }, eq: { atk, def, wgrp: 0, weight: 5 } });

test('a 单挑 blow lands, hurts and recoils as `$B8D3` does from every cursor', () => {
  const lands = {}; let skipped = 0;
  for (const s of ['a', 'd']) for (const cmd of ['feint', 'attack', 'desperate']) for (const curse of [0, 2]) {
    for (const [F, atk, def, hp, ehp] of [[1, 3, 14, 10, 1], [45, 20, 7, 31, 40], [78, 20, 0, 99, 99], [78, 20, 2, 99, 99]]) for (let c0 = 0; c0 < 256; c0++) {
      let c = c0; const draw = (lim, mask = 255) => { for (;;) { const v = T[c++ & 255] & mask; if (v < lim) return v; } };
      let roll = draw(100), d = Math.max(0, Math.floor((F + atk) / 2) - def + draw(11, 15) - 5);
      if (curse) { roll += 20; d += Math.floor((3 * d) / 10); }
      const fs = s === 'a' ? 'd' : 'a', want = { [s]: hp, [fs]: ehp }; let hit;
      if (cmd === 'feint') { hit = roll < 100; d = Math.floor(d / 3); } else if (cmd === 'attack') hit = roll < 70;
      else { hit = roll < 30; d *= 2; if (!hit) want[s] = Math.max(0, hp - draw(21, 31) - 10); }
      if (hit && d < 128) want[fs] = Math.max(0, ehp - d); else if (hit) skipped++;
      const side = { [s]: mk(1, hp, F, atk, def), [fs]: mk(2, ehp, F, atk, def) };
      const duel = new Duel(side, (n) => { assert.equal(n, 256, 'one draw: where the cursor stands'); return c0; }); duel.curse[s] = curse;
      const a = duel.act(s, cmd), at = `${s} ${cmd} 骂倒${curse} F${F} cursor ${c0}`;
      assert.equal(a.hit, hit, at); assert.deepEqual({ a: side.a.hp, d: side.d.hp }, { a: want.a, d: want.d }, at);
      if (F === 78 && def === 2) { const k = `${cmd}${curse ? '+' : ''}`; lands[k] = (lands[k] ?? 0) + (hit ? 0.5 : 0); }
    }
  }
  // of 256 cursors: 牵制 always / 215 under 骂倒, 攻击 (matrix 70) 190 / 141, 舍身 94 / 37
  assert.deepEqual(lands, { feint: 256, 'feint+': 215, attack: 190, 'attack+': 141, desperate: 94, 'desperate+': 37 });
  assert.ok(skipped > 0, '舍身 under 骂倒 reaches the ≥128 byte that skips the hit');
});

test('Duel.odds is the share of cursors a blow lands from', () => {
  for (const [curse, want] of [[0, { feint: 100, attack: 190 / 2.56, desperate: 94 / 2.56 }], [3, { feint: 215 / 2.56, attack: 141 / 2.56, desperate: 37 / 2.56 }]]) {
    const duel = new Duel({ a: mk(1, 99, 78, 20, 2), d: mk(2, 99, 78, 20, 2) }, () => 0); duel.curse.a = curse;
    for (const cmd of ['feint', 'attack', 'desperate']) assert.ok(Math.abs(duel.odds('a', cmd) - want[cmd]) < 1e-9, `${cmd} 骂倒${curse}: ${duel.odds('a', cmd)}`);
    assert.equal(duel.odds('d', 'desperate'), 94 / 2.56, 'his 骂倒 is his own');
  }
});
