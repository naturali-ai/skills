# naturali.ai skills

[Agent Skills](https://agentskills.io) for building, running and auditing AI
agents on [naturali.ai](https://naturali.ai).

Each skill is one atomic module taken from the
[naturali.ai tutorials](https://docs.naturali.ai/docs/tutorials): the commands
that deliver one result, reusable on their own. A module several tutorials
share (create an agent, run a generation, settle an approval) is one skill.

Resources are declared in one formation template, `naturali.yaml`:
`naturali-deploy-a-formation` owns validate, deploy, plan and update, and every
other skill adds its resources to that template. Actions that are not state
(generating, uploading bytes, searching, approving, starting a run) are curl
calls, with the CLI command and SDK method named beside each.

## Install

Claude Code:

```bash
/plugin marketplace add naturali-ai/skills
/plugin install naturali@naturali-skills
```

Any agent that reads Agent Skills: copy the directories under `skills/` into
its skills folder (for Claude Code, `~/.claude/skills/`).

Every skill expects a `nat_sk_…` project API key in `NATURALI_TOKEN`.

## Skills

Start with `naturali` and `naturali-deploy-a-formation`; each skill's **Before
you start** names the skills that produce what it needs.

<!-- skills:start -->
| Skill | Does |
| --- | --- |
| [`naturali`](skills/naturali/SKILL.md) | The API, auth, clients and modules at a glance; start here. |
| [`naturali-create-a-project`](skills/naturali-create-a-project/SKILL.md) | A project to deploy into, its id as `PROJECT`. |
| [`naturali-deploy-a-formation`](skills/naturali-deploy-a-formation/SKILL.md) | Write, validate, deploy, plan, update and tear down `naturali.yaml`. |
| [`naturali-enable-naturali-models`](skills/naturali-enable-naturali-models/SKILL.md) | Every managed model, no vendor account or credential. |
| [`naturali-bring-your-own-model-key`](skills/naturali-bring-your-own-model-key/SKILL.md) | A provider on your own vendor credential. |
| [`naturali-create-an-agent`](skills/naturali-create-an-agent/SKILL.md) | An agent, versioned on every change. |
| [`naturali-run-a-generation`](skills/naturali-run-a-generation/SKILL.md) | One answer from an agent, in the background or inline. |
| [`naturali-read-a-run`](skills/naturali-read-a-run/SKILL.md) | What a run was asked, called, returned and cost. |
| [`naturali-return-structured-output`](skills/naturali-return-structured-output/SKILL.md) | Replies as a validated JSON object. |
| [`naturali-stop-storing-conversation-content`](skills/naturali-stop-storing-conversation-content/SKILL.md) | An agent whose prompts and replies are never stored. |
| [`naturali-give-an-agent-an-http-tool`](skills/naturali-give-an-agent-an-http-tool/SKILL.md) | An agent that calls an HTTP endpoint. |
| [`naturali-run-tools-in-your-own-code`](skills/naturali-run-tools-in-your-own-code/SKILL.md) | A tool your own code runs, the generation paused until it answers. |
| [`naturali-call-a-tool-directly`](skills/naturali-call-a-tool-directly/SKILL.md) | A tool tested on its own, with no agent or model. |
| [`naturali-gate-a-tool-with-guardrails`](skills/naturali-gate-a-tool-with-guardrails/SKILL.md) | Small tool calls run, large ones wait for a person. |
| [`naturali-settle-an-approval`](skills/naturali-settle-an-approval/SKILL.md) | A held action approved, edited or rejected. |
| [`naturali-make-a-file-searchable`](skills/naturali-make-a-file-searchable/SKILL.md) | A file turned into a searchable document. |
| [`naturali-search-knowledge`](skills/naturali-search-knowledge/SKILL.md) | The passages a question retrieves, ranked. |
| [`naturali-ground-an-agent-in-documents`](skills/naturali-ground-an-agent-in-documents/SKILL.md) | An agent that answers from the project's documents. |
| [`naturali-give-an-agent-long-term-memory`](skills/naturali-give-an-agent-long-term-memory/SKILL.md) | An agent that remembers facts across conversations. |
| [`naturali-let-an-agent-write-memories`](skills/naturali-let-an-agent-write-memories/SKILL.md) | An agent that saves what it is asked to remember. |
| [`naturali-limit-what-an-agent-may-do`](skills/naturali-limit-what-an-agent-may-do/SKILL.md) | An agent the platform refuses some actions to. |
| [`naturali-connect-a-discord-channel`](skills/naturali-connect-a-discord-channel/SKILL.md) | An agent answering Discord direct messages. |
| [`naturali-converse-in-a-session`](skills/naturali-converse-in-a-session/SKILL.md) | A multi-turn conversation, read back turn by turn. |
| [`naturali-replay-a-turn`](skills/naturali-replay-a-turn/SKILL.md) | A bad answer re-answered on its exact history. |
| [`naturali-roll-out-an-agent-version`](skills/naturali-roll-out-an-agent-version/SKILL.md) | A new version served to a share of traffic, then promoted. |
| [`naturali-gate-a-rollout-on-an-eval`](skills/naturali-gate-a-rollout-on-an-eval/SKILL.md) | A rollout that promotes only after its eval passes. |
| [`naturali-build-an-eval-dataset`](skills/naturali-build-an-eval-dataset/SKILL.md) | Test cases, hand-written and from real traffic. |
| [`naturali-score-an-agent-change`](skills/naturali-score-an-agent-change/SKILL.md) | A pass/fail verdict on an agent change. |
| [`naturali-score-open-ended-answers`](skills/naturali-score-open-ended-answers/SKILL.md) | Free-text replies graded against a rubric. |
| [`naturali-orchestrate-several-agents`](skills/naturali-orchestrate-several-agents/SKILL.md) | Several agents chained into one run. |
| [`naturali-branch-an-orchestration`](skills/naturali-branch-an-orchestration/SKILL.md) | An orchestration that routes on a classification. |
| [`naturali-pause-a-run-for-a-human-decision`](skills/naturali-pause-a-run-for-a-human-decision/SKILL.md) | An orchestration run that waits for a person. |
| [`naturali-model-a-process-as-a-workflow`](skills/naturali-model-a-process-as-a-workflow/SKILL.md) | A process where an agent drafts and a person reviews. |
| [`naturali-run-an-agent-on-a-schedule`](skills/naturali-run-an-agent-on-a-schedule/SKILL.md) | An agent that runs on a cron schedule. |
| [`naturali-cap-project-spend`](skills/naturali-cap-project-spend/SKILL.md) | A token budget on the whole project. |
| [`naturali-attribute-spend-to-end-users`](skills/naturali-attribute-spend-to-end-users/SKILL.md) | Spend split per end user. |
| [`naturali-cap-spend-per-end-user`](skills/naturali-cap-spend-per-end-user/SKILL.md) | A token budget for each end user. |
| [`naturali-invite-a-colleague`](skills/naturali-invite-a-colleague/SKILL.md) | A teammate added to the project by email. |
<!-- skills:end -->

## Contributing

A skill draws on its tutorial steps (`metadata.source`), the module pages and
the `<Type>ResourceProperties` schemas in the formations spec; when they
change, change the skill. `scripts/validate.mjs` parses every `SKILL.md`
front matter as YAML, as installers do, and runs in CI.

Descriptions stay under 512 characters: every installed skill's description
is in every session's context.

```bash
npm ci
npm run validate
```

The site publishes every skill here at
`https://naturali.ai/.well-known/agent-skills/` on its next deploy.
