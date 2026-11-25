// Re-creates the two small web fonts in src/assets/fonts/ from the full fonts in art/fonts/,
// keeping only the glyphs the string table (src/js/i18n.js) uses.
// Only needed after changing on-screen text. Needs Python 3 with:  pip install -r tools/requirements.txt
//   node tools/fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { navigator: { language: 'zh' }, location: { search: '' }, URLSearchParams };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/i18n.js'), 'utf8'), sandbox);

const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const table of Object.values(sandbox.MR.STR)) for (const s of Object.values(table)) for (const ch of s) chars.add(ch);
// characters the code draws that are not in the string table: level numerals and a few symbols
[...'·!?:,。：、→▲▼%/一二三四五六七八九十'].forEach((c) => chars.add(c));
const charset = path.join(root, 'art/fonts/charset.txt');
fs.writeFileSync(charset, [...chars].join(''));

const python = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);
if (!python) { console.error('Python 3 not found'); process.exit(1); }
for (const [ttf, out] of [['MaShanZheng-Regular.ttf', 'brush.woff2'], ['NotoSerifSC-VF.ttf', 'text.woff2']]) {
  const target = path.join(root, 'src/assets/fonts', out);
  execFileSync(python, ['-m', 'fontTools.subset', path.join(root, 'art/fonts', ttf),
    '--text-file=' + charset, '--flavor=woff2', '--output-file=' + target], { stdio: 'inherit' });
  console.log(out, Math.round(fs.statSync(target).size / 1024) + ' KB, ' + chars.size + ' glyphs requested');
}
