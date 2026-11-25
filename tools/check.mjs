// Pre-deploy sanity check with no dependencies. The GitHub Pages workflow runs it before publishing src/.
//   node tools/check.mjs
// Fails (exit 1) when the site would break on a host: a missing file, a path that only works at a
// domain root, a script that does not parse, or a string missing from one language.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const problems = [], warnings = [];
const exists = (p) => fs.existsSync(path.join(src, p));

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g), ...html.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
const scripts = refs.filter((r) => r.endsWith('.js'));
for (const r of refs) {
  if (r.startsWith('data:')) continue;
  if (/^(\/|[a-z]+:)/i.test(r)) problems.push('index.html: "' + r + '" is not a relative path, it breaks under a sub-path or offline');
  else if (!exists(r)) problems.push('index.html: "' + r + '" does not exist in src/');
}

const sandbox = { navigator: { language: 'zh' }, location: { search: '' }, URLSearchParams, document: {} };
sandbox.window = sandbox;
for (const s of scripts) {
  const code = fs.readFileSync(path.join(src, s), 'utf8');
  try { new vm.Script(code, { filename: s }); } catch (e) { problems.push(s + ': ' + e.message); continue; }
  if (/["'`]\/(assets|js)\//.test(code)) problems.push(s + ': absolute path to /assets or /js, use a relative path');
  if (/https?:\/\/(?!www\.w3\.org)/.test(code)) warnings.push(s + ': contains an http(s) URL, the game should not need the network');
}
vm.runInNewContext(fs.readFileSync(path.join(src, 'js/i18n.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(src, 'js/assets.js'), 'utf8'), sandbox);

for (const [key, p] of Object.entries(sandbox.MR.ASSETS)) {
  if (/^(\/|[a-z]+:)/i.test(p)) problems.push('assets.js: ' + key + ' "' + p + '" is not a relative path');
  else if (!exists(p)) problems.push('assets.js: ' + key + ' "' + p + '" does not exist in src/');
}

// Recorded audio is optional; every file that config.js lists has to be there.
vm.runInNewContext(fs.readFileSync(path.join(src, 'js/config.js'), 'utf8'), sandbox);
const audio = sandbox.MR.AUDIO_FILES || { music: {}, sfx: {} };
let audioFiles = 0;
for (const [kind, table] of Object.entries(audio)) for (const [key, p] of Object.entries(table)) {
  if (!p) continue;
  audioFiles++;
  if (/^(\/|[a-z]+:)/i.test(p)) problems.push('config.js: AUDIO_FILES.' + kind + '.' + key + ' "' + p + '" is not a relative path');
  else if (!exists(p)) problems.push('config.js: AUDIO_FILES.' + kind + '.' + key + ' "' + p + '" does not exist in src/');
}
for (const level of sandbox.MR.LEVELS) if (!sandbox.MR.ASSETS[level.painting]) problems.push('config.js: level "' + level.id + '" names a painting that assets.js does not list');

const { zh, en } = sandbox.MR.STR;
for (const k of Object.keys(zh)) if (!(k in en)) problems.push('i18n.js: "' + k + '" has no English string');
for (const k of Object.keys(en)) if (!(k in zh)) problems.push('i18n.js: "' + k + '" has no Chinese string');

// The two web fonts only contain the glyphs listed in art/fonts/charset.txt.
const charsetFile = path.join(root, 'art/fonts/charset.txt');
if (fs.existsSync(charsetFile)) {
  const have = new Set(fs.readFileSync(charsetFile, 'utf8'));
  const missing = new Set();
  for (const table of [zh, en]) for (const s of Object.values(table)) for (const ch of s) if (!have.has(ch)) missing.add(ch);
  if (missing.size) warnings.push('i18n.js uses glyphs that are not in the subset fonts: ' + [...missing].join('') + '  (they will show in a system font; run: node tools/fonts.mjs)');
}

for (const w of warnings) console.log('warning: ' + w);
for (const p of problems) console.log('ERROR: ' + p);
if (problems.length) process.exit(1);
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log('ok: src/ is a self-contained static site, ' + refs.length + ' references and ' + Object.keys(sandbox.MR.ASSETS).length + ' images' + (audioFiles ? ' and ' + audioFiles + ' audio files' : '') + ' checked, ' + Math.round(size(src) / 1024) + ' KB');
