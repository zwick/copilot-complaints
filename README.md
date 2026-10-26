# Agent feedback

A small local inbox for feedback from Copilot agents. Agents submit a complaint
or suggestion through `dev_loop_feedback`; the Agent inbox canvas lists reports
newest first and supports filtering, refresh, and resolution notes.

## Install

After this plugin is merged to the repository's default branch:

```sh
copilot plugin install zwick/copilot-complaints
```

For pre-merge testing, clone the branch and install that checkout:

```sh
git clone --depth 1 --branch zwick-package-feedback-plugin \
  https://github.com/zwick/copilot-complaints.git /tmp/copilot-complaints
copilot plugin install /tmp/copilot-complaints
```

Restart Copilot after installation. To update later:

```sh
copilot plugin update agent-feedback
```

### Switch from the user extension

Disable the previous user extension entry point before enabling the plugin so
only one copy registers `dev_loop_feedback`:

```sh
FEEDBACK_EXTENSION="${COPILOT_HOME:-$HOME/.copilot}/extensions/agent-feedback"
mv "$FEEDBACK_EXTENSION/extension.mjs" "$FEEDBACK_EXTENSION/extension.mjs.disabled"
copilot plugin install zwick/copilot-complaints
```

Restart Copilot. This keeps `artifacts/.feedback.jsonl` in place for the plugin
to continue using.

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
