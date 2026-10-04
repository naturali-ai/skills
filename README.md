# naturali.ai skills

[Agent Skills](https://agentskills.io) for building, running and auditing AI
agents on [naturali.ai](https://naturali.ai).

Each skill is one capability an agent combines with others to build what a
user asks for. Systems are built as a **formation**: `naturali-formations`
owns the template and its validate, plan, deploy and update calls, and every
other skill documents how to declare its resource types in that template, the
actions that are not state (generating, firing a trigger, approving, uploading
bytes), and the direct routes for when a user asks for them.

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

Start with `naturali` and `naturali-formations`; each skill's **Before you
start** names the skills that produce what it needs.

<!-- skills:start -->
| Skill | Does |
| --- | --- |
| [`naturali`](skills/naturali/SKILL.md) | The API, auth, clients and modules at a glance; start here. |
| [`naturali-enable-naturali-models`](skills/naturali-enable-naturali-models/SKILL.md) | Enable naturali models |
| [`naturali-create-a-provider`](skills/naturali-create-a-provider/SKILL.md) | Create a provider |
| [`naturali-first-agent-generation`](skills/naturali-first-agent-generation/SKILL.md) | Your first agent generation |
| [`naturali-answer-from-your-documents`](skills/naturali-answer-from-your-documents/SKILL.md) | Answer from your documents |
| [`naturali-answer-from-images-and-audio`](skills/naturali-answer-from-images-and-audio/SKILL.md) | Answer from images and audio |
| [`naturali-give-an-agent-long-term-memory`](skills/naturali-give-an-agent-long-term-memory/SKILL.md) | Give an agent long-term memory |
| [`naturali-connect-a-discord-channel`](skills/naturali-connect-a-discord-channel/SKILL.md) | Connect a Discord channel |
| [`naturali-structured-output`](skills/naturali-structured-output/SKILL.md) | Structured output |
| [`naturali-roll-out-an-agent-version`](skills/naturali-roll-out-an-agent-version/SKILL.md) | Roll out an agent version |
| [`naturali-run-tools-in-your-own-code`](skills/naturali-run-tools-in-your-own-code/SKILL.md) | Run tools in your own code |
| [`naturali-limit-what-an-agent-may-do`](skills/naturali-limit-what-an-agent-may-do/SKILL.md) | Limit what an agent may do |
| [`naturali-run-an-agent-on-a-schedule`](skills/naturali-run-an-agent-on-a-schedule/SKILL.md) | Run an agent on a schedule |
| [`naturali-orchestrate-several-agents`](skills/naturali-orchestrate-several-agents/SKILL.md) | Orchestrate several agents |
| [`naturali-branch-an-orchestration`](skills/naturali-branch-an-orchestration/SKILL.md) | Branch an orchestration |
| [`naturali-model-a-process-as-a-workflow`](skills/naturali-model-a-process-as-a-workflow/SKILL.md) | Model a process as a workflow |
| [`naturali-deploy-a-system-from-a-template`](skills/naturali-deploy-a-system-from-a-template/SKILL.md) | Deploy a system from a template |
| [`naturali-gate-a-tool-with-guardrails`](skills/naturali-gate-a-tool-with-guardrails/SKILL.md) | Gate a tool with guardrails |
| [`naturali-pause-a-run-for-a-human-decision`](skills/naturali-pause-a-run-for-a-human-decision/SKILL.md) | Pause a run for a human decision |
| [`naturali-keep-no-conversation-content`](skills/naturali-keep-no-conversation-content/SKILL.md) | Run a zero-retention agent |
| [`naturali-debug-a-failed-run`](skills/naturali-debug-a-failed-run/SKILL.md) | Debug a failed run |
| [`naturali-replay-a-bad-answer`](skills/naturali-replay-a-bad-answer/SKILL.md) | Replay a bad answer |
| [`naturali-score-an-agent-change`](skills/naturali-score-an-agent-change/SKILL.md) | Score an agent change |
| [`naturali-score-open-ended-answers`](skills/naturali-score-open-ended-answers/SKILL.md) | Score open-ended answers |
| [`naturali-gate-a-rollout-on-an-eval`](skills/naturali-gate-a-rollout-on-an-eval/SKILL.md) | Gate a rollout on an eval |
| [`naturali-cap-project-spend`](skills/naturali-cap-project-spend/SKILL.md) | Cap a project's spend |
| [`naturali-cap-spend-per-end-user`](skills/naturali-cap-spend-per-end-user/SKILL.md) | Cap spend per end user |
| [`naturali-invite-a-colleague`](skills/naturali-invite-a-colleague/SKILL.md) | Invite a colleague |
<!-- skills:end -->

## Contributing

A skill draws on its module page (`metadata.docs`), the tutorials and the
`<Type>ResourceProperties` schemas in the formations spec; when they change,
change the skill. `node scripts/validate.mjs` checks every `SKILL.md` and runs
in CI.

`skills/naturali` mirrors `landing/skills/naturali/SKILL.md` in the naturali.ai
repository, which publishes it at
`https://naturali.ai/.well-known/agent-skills/`; edit it there first.
