# Agent feedback

A small local inbox for feedback from Copilot agents. Agents submit a complaint
or suggestion through `dev_loop_feedback`; the Agent inbox canvas lists reports
newest first and supports filtering, refresh, and resolution notes.

## Install

```sh
copilot plugin install zwick/copilot-complaints
```

Restart Copilot after installation. To update later:

```sh
copilot plugin update agent-feedback
```

## Use

Ask Copilot to **open my Agent inbox**. Agents can submit feedback through
`dev_loop_feedback` with a short `summary`, a `kind` of `complaint` or
`suggestion`, and an optional `fix`. Session ID and timestamp are recorded
automatically.

Reports remain in the existing append-only inbox:

```text
${COPILOT_HOME:-$HOME/.copilot}/extensions/agent-feedback/artifacts/.feedback.jsonl
```

Plugin installation and updates do not manage this file. Back it up separately
if needed, and keep reports free of secrets, customer details, copied code,
prompts, paths, and logs.

## Test

```sh
node --test extensions/agent-feedback/feedback.test.mjs
```
