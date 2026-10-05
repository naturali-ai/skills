#!/usr/bin/env node
// Checks every skills/<name>/SKILL.md against the Agent Skills spec and this repo's conventions.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

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
  let meta;
  try {
    meta = parse(fm[1]);
  } catch (error) {
    // Installers parse the front matter as YAML and skip the skill when it fails.
    fail(`front matter is not valid YAML: ${error.message.split('\n')[0]}`);
    continue;
  }
  const { name, description, license } = meta ?? {};
  if (name !== dir) fail(`name "${name}" must equal the directory name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? '') || name.length > 64) {
    fail('name must be 1-64 lowercase letters, digits and single hyphens');
  }
  if (typeof description !== 'string' || !description) fail('missing description');
  // Every installed description is loaded into every session; the spec allows 1024.
  else if (description.length > 512) fail(`description is ${description.length} chars (max 512)`);
  else if (/[<>]/.test(description)) fail('description must not contain angle brackets');
  if (!license) fail('missing license');
  if (/\]\((?!https?:)/.test(text)) fail('relative link; a skill must stand alone');
  if (/\bsoat\b/i.test(text)) fail('names the upstream runtime');
  for (const [, ref] of text.matchAll(/`(naturali-[a-z0-9-]+)`/g)) {
    if (!names.includes(ref)) fail(`references unknown skill ${ref}`);
  }
}

const manifests = {
  'plugin.json': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  'mcp.json': 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
};
for (const [file, schema] of Object.entries(manifests)) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', file), 'utf8'));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    continue;
  }
  if (manifest.$schema !== schema) errors.push(`${file}: $schema must be ${schema}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${names.length} skills valid`);
