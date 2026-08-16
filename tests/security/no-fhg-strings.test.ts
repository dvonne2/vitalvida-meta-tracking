import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BAD_STRINGS = [
  '220381209723501',
  'fulanihair',
  'fulani-hair',
  'fhg_',
  '__fhg',
  'hajara',
  'amina',
  'nigeriaLGAs',
  'do.fulanihair',
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|js|json|md)$/.test(entry.name) && !entry.name.includes('no-fhg-strings')) files.push(full);
  }
  return files;
}

describe('security/no-fhg-strings', () => {
  it('src contains no Fulani Hair Secrets-specific identifiers', () => {
    const files = walk('src', []);
    for (const file of files) {
      const content = readFileSync(file, 'utf8').toLowerCase();
      for (const bad of BAD_STRINGS) {
        assert.equal(
          content.includes(bad.toLowerCase()),
          false,
          `Forbidden string "${bad}" found in ${file}`,
        );
      }
    }
  });
});
