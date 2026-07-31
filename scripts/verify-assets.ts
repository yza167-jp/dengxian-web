import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALAMITIES,
  CHARACTERS,
  FATES,
  OPPORTUNITIES,
  UPSTREAM_COMMIT,
} from '../src/shared/data/content';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = join(projectRoot, 'public', 'assets', 'upstream');

const presentationAssets = [
  'raw/01-封面招募.png',
  'raw/02-末法世界与共同目标.png',
  'raw/03-共同修台争夺飞升.png',
  'raw/04-每轮秘密四选一.png',
  'web/01-封面招募-720.webp',
  'web/01-封面招募-941.webp',
  'web/02-末法世界与共同目标-720.webp',
  'web/02-末法世界与共同目标-941.webp',
  'web/03-共同修台争夺飞升-720.webp',
  'web/03-共同修台争夺飞升-941.webp',
  'web/04-每轮秘密四选一-720.webp',
  'web/04-每轮秘密四选一-941.webp',
  'actions/cultivate.webp',
  'actions/repair.webp',
  'actions/resist.webp',
  'actions/explore.webp',
  'table/altar.webp',
  'social/cover-og-1200x630.webp',
] as const;

const characterAssets = CHARACTERS.flatMap((character) => [
  `characters/${character.id}-card.webp`,
  `characters/${character.id}-portrait.webp`,
]);
const opportunityAssets = OPPORTUNITIES.map((card) => `cards/${card.id}.webp`);
const calamityAssets = CALAMITIES.map((card) => `cards/${card.id}.webp`);
const fateAssets = FATES.map((card) => `cards/${card.id}.webp`);
const expectedAssets = new Set([
  ...presentationAssets,
  ...characterAssets,
  ...opportunityAssets,
  ...calamityAssets,
  ...fateAssets,
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile()) files.push(relative(upstreamRoot, absolute).split(sep).join('/'));
  }
  return files;
}

function assertImageSignature(path: string, bytes: Buffer): void {
  assert(bytes.byteLength > 1_000, `${path} is unexpectedly small (${bytes.byteLength} bytes)`);
  if (path.endsWith('.webp')) {
    assert(bytes.subarray(0, 4).toString('ascii') === 'RIFF', `${path} is missing the RIFF header`);
    assert(bytes.subarray(8, 12).toString('ascii') === 'WEBP', `${path} is not a WebP image`);
    return;
  }
  if (path.endsWith('.png')) {
    assert(
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      `${path} is not a PNG image`,
    );
    return;
  }
  throw new Error(`Unsupported upstream asset type: ${path}`);
}

const actualAssets = (await collectFiles(upstreamRoot)).sort();
const missingAssets = [...expectedAssets].filter((path) => !actualAssets.includes(path)).sort();
const unexpectedAssets = actualAssets.filter((path) => !expectedAssets.has(path)).sort();
assert(missingAssets.length === 0, `Missing upstream assets: ${missingAssets.join(', ')}`);
assert(unexpectedAssets.length === 0, `Undocumented upstream assets: ${unexpectedAssets.join(', ')}`);

let totalBytes = 0;
for (const path of actualAssets) {
  const bytes = await readFile(join(upstreamRoot, path));
  assertImageSignature(path, bytes);
  totalBytes += bytes.byteLength;
}

const vendoredCommit = (
  await readFile(join(projectRoot, 'vendor', 'mofa-dengxiantai', 'UPSTREAM_COMMIT'), 'utf8')
).trim();
assert(vendoredCommit === UPSTREAM_COMMIT, 'Vendored commit does not match generated content');

const manifest = await readFile(join(projectRoot, 'docs', 'ASSET_MANIFEST.md'), 'utf8');
assert(manifest.includes(UPSTREAM_COMMIT), 'Asset manifest is missing the pinned upstream commit');
for (const path of [...presentationAssets, ...characterAssets, ...opportunityAssets]) {
  assert(
    manifest.includes(`public/assets/upstream/${path}`),
    `Asset manifest does not account for public/assets/upstream/${path}`,
  );
}
assert(
  manifest.includes('`public/assets/upstream/cards/T01.webp` … `T18.webp`'),
  'Asset manifest is missing the complete calamity-art range',
);
assert(
  manifest.includes('`public/assets/upstream/cards/F01.webp` … `F12.webp`'),
  'Asset manifest is missing the complete fate-art range',
);

console.log(JSON.stringify({
  ok: true,
  upstreamCommit: UPSTREAM_COMMIT,
  files: actualAssets.length,
  totalBytes,
  categories: {
    presentation: presentationAssets.length,
    characterCardsAndPortraits: characterAssets.length,
    opportunities: opportunityAssets.length,
    calamities: calamityAssets.length,
    fates: fateAssets.length,
  },
}, null, 2));
