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
| [`naturali-create-a-project`](skills/naturali-create-a-project/SKILL.md) | Create a project |
| [`naturali-deploy-a-formation`](skills/naturali-deploy-a-formation/SKILL.md) | Deploy a formation |
| [`naturali-enable-naturali-models`](skills/naturali-enable-naturali-models/SKILL.md) | Enable naturali models |
| [`naturali-bring-your-own-model-key`](skills/naturali-bring-your-own-model-key/SKILL.md) | Bring your own model key |
| [`naturali-create-an-agent`](skills/naturali-create-an-agent/SKILL.md) | Create an agent |
| [`naturali-run-a-generation`](skills/naturali-run-a-generation/SKILL.md) | Run a generation |
| [`naturali-read-a-run`](skills/naturali-read-a-run/SKILL.md) | Read a run |
| [`naturali-return-structured-output`](skills/naturali-return-structured-output/SKILL.md) | Return structured output |
| [`naturali-stop-storing-conversation-content`](skills/naturali-stop-storing-conversation-content/SKILL.md) | Stop storing conversation content |
| [`naturali-give-an-agent-an-http-tool`](skills/naturali-give-an-agent-an-http-tool/SKILL.md) | Give an agent an HTTP tool |
| [`naturali-run-tools-in-your-own-code`](skills/naturali-run-tools-in-your-own-code/SKILL.md) | Run tools in your own code |
| [`naturali-call-a-tool-directly`](skills/naturali-call-a-tool-directly/SKILL.md) | Call a tool directly |
| [`naturali-gate-a-tool-with-guardrails`](skills/naturali-gate-a-tool-with-guardrails/SKILL.md) | Gate a tool with guardrails |
| [`naturali-settle-an-approval`](skills/naturali-settle-an-approval/SKILL.md) | Settle an approval |
| [`naturali-make-a-file-searchable`](skills/naturali-make-a-file-searchable/SKILL.md) | Make a file searchable |
| [`naturali-search-knowledge`](skills/naturali-search-knowledge/SKILL.md) | Search knowledge |
| [`naturali-ground-an-agent-in-documents`](skills/naturali-ground-an-agent-in-documents/SKILL.md) | Ground an agent in documents |
| [`naturali-give-an-agent-long-term-memory`](skills/naturali-give-an-agent-long-term-memory/SKILL.md) | Give an agent long-term memory |
| [`naturali-let-an-agent-write-memories`](skills/naturali-let-an-agent-write-memories/SKILL.md) | Let an agent write memories |
| [`naturali-limit-what-an-agent-may-do`](skills/naturali-limit-what-an-agent-may-do/SKILL.md) | Limit what an agent may do |
| [`naturali-connect-a-discord-channel`](skills/naturali-connect-a-discord-channel/SKILL.md) | Connect a Discord channel |
| [`naturali-converse-in-a-session`](skills/naturali-converse-in-a-session/SKILL.md) | Converse in a session |
| [`naturali-replay-a-turn`](skills/naturali-replay-a-turn/SKILL.md) | Replay a turn |
| [`naturali-roll-out-an-agent-version`](skills/naturali-roll-out-an-agent-version/SKILL.md) | Roll out an agent version |
| [`naturali-gate-a-rollout-on-an-eval`](skills/naturali-gate-a-rollout-on-an-eval/SKILL.md) | Gate a rollout on an eval |
| [`naturali-build-an-eval-dataset`](skills/naturali-build-an-eval-dataset/SKILL.md) | Build an eval dataset |
| [`naturali-score-an-agent-change`](skills/naturali-score-an-agent-change/SKILL.md) | Score an agent change |
| [`naturali-score-open-ended-answers`](skills/naturali-score-open-ended-answers/SKILL.md) | Score open-ended answers |
| [`naturali-orchestrate-several-agents`](skills/naturali-orchestrate-several-agents/SKILL.md) | Orchestrate several agents |
| [`naturali-branch-an-orchestration`](skills/naturali-branch-an-orchestration/SKILL.md) | Branch an orchestration |
| [`naturali-pause-a-run-for-a-human-decision`](skills/naturali-pause-a-run-for-a-human-decision/SKILL.md) | Pause a run for a human decision |
| [`naturali-model-a-process-as-a-workflow`](skills/naturali-model-a-process-as-a-workflow/SKILL.md) | Model a process as a workflow |
| [`naturali-run-an-agent-on-a-schedule`](skills/naturali-run-an-agent-on-a-schedule/SKILL.md) | Run an agent on a schedule |
| [`naturali-cap-project-spend`](skills/naturali-cap-project-spend/SKILL.md) | Cap a project's spend |
| [`naturali-attribute-spend-to-end-users`](skills/naturali-attribute-spend-to-end-users/SKILL.md) | Attribute spend to end users |
| [`naturali-cap-spend-per-end-user`](skills/naturali-cap-spend-per-end-user/SKILL.md) | Cap spend per end user |
| [`naturali-invite-a-colleague`](skills/naturali-invite-a-colleague/SKILL.md) | Invite a colleague |
<!-- skills:end -->

## Contributing

A skill draws on its tutorial steps (`metadata.source`), the module pages and
the `<Type>ResourceProperties` schemas in the formations spec; when they
change, change the skill. `node scripts/validate.mjs` checks every `SKILL.md`
and runs in CI.

`skills/naturali` mirrors `landing/skills/naturali/SKILL.md` in the naturali.ai
repository, which publishes it at
`https://naturali.ai/.well-known/agent-skills/`; edit it there first.
