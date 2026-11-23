// Turns the Postiz UI into "sosyalmedya" for the desktop build.
// Runs in CI on a fresh checkout before `pnpm run build`; the repository
// itself keeps the upstream text so future Postiz updates merge cleanly.
//
// usage: node desktop/scripts/rebrand.mjs <repo-root>
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'sosyalmedya';
const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'rebrand');

// 1. Logos and icons.
const copies = [
  ['logo.tsx', 'apps/frontend/src/components/new-layout/logo.tsx'],
  ['logo-text.component.tsx', 'apps/frontend/src/components/ui/logo-text.component.tsx'],
  ['favicon.ico', 'apps/frontend/public/favicon.ico'],
  ['favicon.png', 'apps/frontend/public/favicon.png'],
  ['favicon.png', 'apps/frontend/public/postiz-fav.png'],
  ['logo.svg', 'apps/frontend/public/logo.svg'],
  ['logo.svg', 'apps/frontend/public/postiz.svg'],
  ['logo-text.svg', 'apps/frontend/public/logo-text.svg'],
  ['logo-text.svg', 'apps/frontend/public/postiz-text.svg'],
  ['google.provider.tsx', 'apps/frontend/src/components/auth/providers/google.provider.tsx'],
];
for (const [from, to] of copies) {
  copyFileSync(join(assets, from), join(root, to));
}

// 2. Visible product name. Only the capitalised word "Postiz" on its own is
// replaced: identifiers (PostizProvider), package names (postiz) and URLs
// (postiz.com) are lower-case or glued to other letters and stay untouched.
const WORD = /(?<![\w.@/-])Postiz(?![\w-])/g;

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(name))) out.push(full);
  }
  return out;
}

const targets = [
  ...walk(join(root, 'apps/frontend/src'), ['.ts', '.tsx']),
  ...walk(join(root, 'libraries/react-shared-libraries/src'), ['.ts', '.tsx', '.json']),
];

let files = 0;
let hits = 0;
for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  let count = 0;
  let next;
  if (file.endsWith('.json')) {
    // Translation files: change values only, keep keys as they are.
    const data = JSON.parse(text);
    const fix = (v) => {
      if (typeof v === 'string') {
        return v.replace(WORD, () => {
          count++;
          return NAME;
        });
      }
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) v[k] = fix(v[k]);
      }
      return v;
    };
    fix(data);
    next = count ? JSON.stringify(data, null, 2) + '\n' : text;
  } else {
    next = text
      .split('\n')
      .map((line) => {
        // Leave imports and comments alone.
        const trimmed = line.trim();
        if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
          return line;
        }
        return line.replace(WORD, () => {
          count++;
          return NAME;
        });
      })
      .join('\n');
  }
  if (count) {
    writeFileSync(file, next);
    files++;
    hits += count;
  }
}

// 3. With Google sign-in hidden, the "Continue With" / "or" labels around it
// would point at nothing. Warn (not fail) if upstream changed these lines.
for (const rel of [
  'apps/frontend/src/components/auth/login.tsx',
  'apps/frontend/src/components/auth/register.tsx',
]) {
  const file = join(root, rel);
  const text = readFileSync(file, 'utf8');
  const next = text
    .replace("{t('continue_with', 'Continue With')}", '{null}')
    .replace("{t('or', 'or')}", '{null}');
  if (next === text) console.warn(`rebrand: sign-in labels not found in ${rel}`);
  else writeFileSync(file, next);
}

console.log(`rebrand: ${copies.length} assets copied, ${hits} names replaced in ${files} files`);
