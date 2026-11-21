import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from './game.mjs';

test('a failed WebGL startup tells the player how to recover and allows a retry', async () => {
  const game = await startGame({ width: 667, height: 360 });
  try {
    const page = await game.open('&phone');
    await page.addInitScript(() => {
      const key = 'test-webgl-startup-blocked';
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === 'webgl2') return null;
        return getContext.call(this, type, ...args);
      };
    });
    await page.reload();
    const error = page.getByRole('dialog', { name: /WebGL 2/ });
    await error.waitFor({ timeout: 15000 }).catch((failure) => {
      throw new Error(`The WebGL startup dialog did not appear. Page errors: ${page.errors.join(', ')}`, { cause: failure });
    });
    assert.match(await error.innerText(), /显卡驱动/);
    assert.doesNotMatch(await error.innerText(), /B 站/);
    assert.match(await error.innerText(), /错误信息：.*WebGL context/i);
    assert.equal(await page.locator('#stage > canvas').count(), 0);
    assert.ok(page.errors.some((message) => /Error creating WebGL context/i.test(message)));

    await page.setViewportSize({ width: 360, height: 667 });
    await error.getByRole('button', { name: '重新载入' }).click();
    await page.waitForFunction(() => window.__game?.debug, null, { timeout: 30000 });
    assert.equal(await error.count(), 0);
    assert.equal(await page.locator('#stage > canvas').count(), 1);
  } finally {
    await game.close();
  }
});
