// electron-builder afterPack. The Windows zip is cross-built on macOS with exe editing off
// (signAndEditExecutable: false, so no wine), which leaves Three Kingdoms HD-2D.exe with Electron's icon;
// put the game's icon (build/icon.ico, made by tools/make_icons.py) into the exe's resources here,
// in plain JS (resedit), replacing the existing icon group so Explorer and the taskbar show it.
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const ne = NtExecutable.from(readFileSync(exe), { ignoreCert: true });
  const res = NtExecutableResource.from(ne);
  const ico = Data.IconFile.from(readFileSync(path.join(__dirname, 'icon.ico')));
  const [group] = Resource.IconGroupEntry.fromEntries(res.entries);
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, group?.id ?? 1, group?.lang ?? 1033, ico.icons.map((i) => i.data));
  res.outputResource(ne);
  writeFileSync(exe, Buffer.from(ne.generate()));
  console.log(`  • embedded icon  file=${path.relative(process.cwd(), exe)}`);
};
