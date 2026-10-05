# AGENTS.md

Agent Skills for [naturali.ai](https://naturali.ai), packaged as an
[Agent Plugin](https://agent-plugins.org/specification) and a Claude Code
marketplace.

## Layout

| Path | What it is |
| --- | --- |
| `skills/<name>/SKILL.md` | One skill. `naturali` is the entry point; every other skill is one tutorial step. |
| `plugin.json`, `mcp.json` | The Agent Plugin manifest and the naturali MCP server it bundles. |
| `.claude-plugin/marketplace.json` | The Claude Code marketplace serving this repo as the `naturali` plugin. |
| `scripts/validate.mjs` | Every rule below that a machine can check; runs in CI. |

## Rules for a skill

- `name` equals its directory: lowercase letters, digits and single hyphens, at most 64 characters.
- `description` says when to use the skill, in at most 512 characters and with no angle brackets: every installed description is in every session's context.
- `license: Apache-2.0`.
- A skill stands alone: absolute links only, and every `` `naturali-…` `` it names is a skill in `skills/`.
- Never name the upstream runtime naturali runs on; say "naturali".
- Resources go in the formation template owned by `naturali-deploy-a-formation`; actions that are not state are curl calls, with the CLI command and SDK method named beside each.
- A skill follows its tutorial (`metadata.source`), the module pages and the formations spec. When they change, change the skill.

## Before a pull request

```bash
npm ci
npm run validate
```

A new or renamed skill also gets its row in the README table between `skills:start` and `skills:end`. naturali.ai republishes every skill at
`https://naturali.ai/.well-known/agent-skills/` on its next deploy.
