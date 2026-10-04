#!/usr/bin/env node
// Checks every skills/<name>/SKILL.md against the Agent Skills spec and this repo's conventions.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'skills');
const names = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const errors = [];

for (const dir of names) {
  const file = join(root, dir, 'SKILL.md');
  const fail = (msg) => errors.push(`${dir}: ${msg}`);
  if (!existsSync(file)) {
    fail('missing SKILL.md');
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    fail('missing front matter');
    continue;
  }
  const field = (key) => fm[1].match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1].trim();
  const name = field('name');
  const description = field('description');
  if (name !== dir) fail(`name "${name}" must equal the directory name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? '') || name.length > 64) {
    fail('name must be 1-64 lowercase letters, digits and single hyphens');
  }
  if (!description) fail('missing description');
  else if (description.length > 1024) fail(`description is ${description.length} chars (max 1024)`);
  else if (/[<>]/.test(description)) fail('description must not contain angle brackets');
  if (!field('license')) fail('missing license');
  if (/\]\((?!https?:)/.test(text)) fail('relative link; a skill must stand alone');
  if (/\bsoat\b/i.test(text)) fail('names the upstream runtime');
  for (const [, ref] of text.matchAll(/`(naturali-[a-z0-9-]+)`/g)) {
    if (!names.includes(ref)) fail(`references unknown skill ${ref}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${names.length} skills valid`);
