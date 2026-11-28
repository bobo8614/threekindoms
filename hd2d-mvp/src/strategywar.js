// Strategy AI wars: the camera and the territory focus for a war between two AI factions, driven by app.js.
// The war itself plays in a window at the side of the map (vignette.js warWindow) and its outcome flashes on the city
// (strategy.js announce); nothing marches on the board (2026-11-27: the standards that did were dropped for the window).
export function createStrategyWar({ frame, focusCity, attention }) {
  let warShow = null;
  // The original's three beats (「××軍 出陣」, 「××軍 戦闘中」, the winner's 「××軍 勝利」, 142 frames each;
  // research/strategic-ai-evidence.md): the march frames the two cities and the view holds there to the end, so the
  // window placed clear of them (app.js) stays clear.
  function aiWar({ from, to }) {
    warShow?.dispose();
    let stage = null;
    const show = warShow = {
      march() { stage = 'march'; if (from != null && from !== to) frame([from, to]); else focusCity(to); },
      clash() { stage = 'clash'; },
      end() { stage = 'end'; },
      tick() {},
      debug: () => ({ stage }),
      dispose() { if (warShow === show) { warShow = null; attention(); } },
    };
    attention(); return show;
  }
  return { aiWar, get active() { return !!warShow; }, update() {} };
}
