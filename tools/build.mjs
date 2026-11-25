// Packaging script with no dependencies (Node 18 or newer, no npm install).
//   node tools/build.mjs
// The game needs no build to run or deploy: src/ already is the site. This only makes hand-in packages:
//   dist/moran-itch.zip     the site as a zip with index.html at the zip root (plus CREDITS.md):
//                           upload it to itch.io as it is, or unzip it and double-click index.html
//   dist/moran.html         one self-contained file (scripts inlined; images, fonts and any audio
//                           files listed in MR.AUDIO_FILES as data URIs)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src'), dist = path.join(root, 'dist');
const read = (p) => fs.readFileSync(path.join(src, p));

// --- minimal zip writer (deflate, forward slashes, fixed timestamp so builds are reproducible)
const CRC = new Int32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; return n; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), prefix + e.name + '/') : [{ name: prefix + e.name, file: path.join(dir, e.name) }]);
}
function writeZip(out, entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, file } of entries) {
    const data = fs.readFileSync(file), packed = zlib.deflateRawSync(data, { level: 9 }), nameBuf = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(26);
    head.writeUInt16LE(20, 0); head.writeUInt16LE(0x0800, 2); head.writeUInt16LE(8, 4);
    head.writeUInt16LE(0, 6); head.writeUInt16LE(0x21, 8); // 1980-01-01
    head.writeUInt32LE(crc32(data), 10); head.writeUInt32LE(packed.length, 14); head.writeUInt32LE(data.length, 18);
    head.writeUInt16LE(nameBuf.length, 22); head.writeUInt16LE(0, 24);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), head, nameBuf, packed]);
    const extra = Buffer.alloc(14);
    extra.writeUInt32LE((0o100644 << 16) >>> 0, 6); extra.writeUInt32LE(offset, 10);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2, 20, 3]), head, extra, nameBuf]));
    parts.push(local);
    offset += local.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...parts, dir, end]));
}

// --- zip (index.html at the root, which is what itch.io wants)
fs.mkdirSync(dist, { recursive: true });
writeZip(path.join(dist, 'moran-itch.zip'), [...walk(src), { name: 'CREDITS.md', file: path.join(root, 'CREDITS.md') }]);

// --- single file
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const dataUri = (p) => 'data:' + mime[path.extname(p)] + ';base64,' + read(p).toString('base64');
let html = read('index.html').toString();
html = html.replace(/url\("(assets\/fonts\/[^"]+)"\)/g, (_, p) => 'url("' + dataUri(p) + '")');
const sandbox = { document: { createElement: () => ({}) } };
sandbox.window = sandbox;
const assets = vm.runInNewContext(read('js/assets.js').toString() + '; MR.ASSETS', sandbox);
const embed = {};
for (const p of Object.values(assets)) embed[p] = dataUri(p);
const audio = vm.runInNewContext(read('js/config.js').toString() + '; MR.AUDIO_FILES', sandbox);
for (const p of [...Object.values(audio.music), ...Object.values(audio.sfx)]) if (p) embed[p] = dataUri(p);
html = html.replace('<!--EMBED-->', () => '<script>window.MR_EMBED = ' + JSON.stringify(embed) + ';</script>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => '<script>\n' + read(p).toString() + '\n</script>');
fs.writeFileSync(path.join(dist, 'moran.html'), html);

const kb = (p) => String(Math.round(fs.statSync(path.join(dist, p)).size / 1024)).padStart(5) + ' KB';
console.log('dist/moran-itch.zip  ' + kb('moran-itch.zip') + '  itch.io upload (index.html at the zip root); also plays after unzipping');
console.log('dist/moran.html      ' + kb('moran.html') + '  single file, runs by double-click');
