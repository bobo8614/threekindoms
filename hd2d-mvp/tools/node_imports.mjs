// Run the game's browser modules under Node (tools that need the season tables and the like): resolves
// 'three' as index.html's import map does, to the copy desktop/ installs.
//   node --import ./hd2d-mvp/tools/node_imports.mjs <script>
import { register } from 'node:module';
const three = new URL('../desktop/node_modules/three/', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: '${three}build/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: '${three}examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`));
