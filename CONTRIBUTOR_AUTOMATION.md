# OpenCode upstream contribution automation

This fork contains a conservative workflow for contributing to `anomalyco/opencode` as `GYJ99`.

## State machine

1. **Observe**: scan and report one suitable candidate without writing upstream.
2. **Claim**: post one concise request for assignment, then wait.
3. **Autopilot**: after a maintainer assigns the issue to `GYJ99`, create a focused patch, run checks, push a branch to this fork, and open an upstream pull request.

The workflow never self-assigns an upstream issue. It pauses while an upstream pull request by `GYJ99` is open or while a recent assignment request is pending.

## Activation prerequisite

GitHub only schedules a workflow after its workflow file exists on the repository's default branch. Merge the fork-local pull request that adds this automation into `dev` before expecting scheduled or manual runs to appear.

Keep scheduled runs disabled while configuring credentials:

- `CONTRIBUTOR_BOT_ENABLED=false`
- `CONTRIBUTION_MODE=observe`

## Required repository secrets

Create these under **Settings → Secrets and variables → Actions → Secrets**. Never paste either value into an issue, pull request, workflow file, log, or chat message.

- `CONTRIBUTOR_GITHUB_TOKEN`: a `GYJ99` personal access token used for upstream comments, fork branch pushes, and pull-request creation. For a public organization repository not owned by `GYJ99`, use a classic token with only the `public_repo` scope, set a short expiration, and rotate it periodically.
- `OPENCODE_API_KEY`: the OpenCode Zen or OpenCode Go API key used by the implementation agent.

The workflow removes GitHub token variables before starting the implementation model. Only the surrounding validation/submission process receives `CONTRIBUTOR_GITHUB_TOKEN`.

## Required repository variables

Create these under **Settings → Secrets and variables → Actions → Variables**:

- `CONTRIBUTOR_BOT_ENABLED`: start with `false`; change to `true` only after a successful manual observe run.
- `CONTRIBUTION_MODE`: `observe`, `claim`, or `autopilot`. Start with `observe`.
- `CONTRIBUTOR_MODEL`: a current OpenCode model ID in `provider/model` form. Confirm it with `/models` before enabling autopilot.
- `CONTRIBUTOR_PR_DRAFT`: keep `true` during rollout.

Recommended optional variables:

- `CONTRIBUTOR_CLAIM_TTL_HOURS=168`: wait seven days for assignment before allowing another candidate. The bot will not post a duplicate claim on the expired issue.
- `CONTRIBUTOR_ALLOW_UI=false`: excludes app, desktop, TUI, and other design-sensitive work. UI changes require supervised approval and screenshots.
- `CONTRIBUTOR_MAX_CHANGED_FILES=12`
- `CONTRIBUTOR_MAX_DIFF_LINES=800`
- `CONTRIBUTOR_MAX_CHANGED_BYTES=2000000`

## Schedule and manual runs

The workflow scans hourly at minute 17 UTC. It can also be run manually from **Actions → OpenCode upstream contributor → Run workflow**, with an optional upstream issue number.

Recommended rollout:

1. Merge the fork-local automation PR into `dev`.
2. Add the two secrets and variables above while leaving the bot disabled.
3. Run manually in `observe` mode and inspect the selected issue; no upstream write occurs.
4. Run manually in `claim` mode only after the candidate quality is acceptable.
5. Leave the workflow waiting until an OpenCode maintainer assigns the issue to `GYJ99`.
6. Run `autopilot` manually for the first assigned issue. Keep the upstream PR as a draft and review its diff and checks.
7. Set `CONTRIBUTOR_BOT_ENABLED=true` only after the complete path succeeds.

## Guardrails

- One open upstream pull request or one recent pending claim at a time.
- Issues younger than six hours are ignored to allow repository compliance checks to finish.
- Assigned-to-others, previously claimed, linked-PR, feature/design, support, billing, service-only, dependency, and workflow issues are excluded by default.
- Read-only GitHub API calls retry transient rate limits and server failures; comments, pushes, and PR creation are never blindly replayed.
- The implementation process receives no GitHub token. Shell, external network, external directory, and subagent access are explicitly denied during code generation.
- Changes under `.github`, package manifests, lockfiles, credential-like paths, and common binary formats are rejected.
- UI-related paths are rejected unless explicitly enabled, and any resulting UI pull request remains a draft pending screenshots.
- The workflow runs `git diff --cached --check`, repository lint, repository typecheck, and available tests for up to three changed packages before submitting.
- The generated pull-request body follows OpenCode's required template and links the assigned issue.
- Commits use `GYJ99 <112795205+GYJ99@users.noreply.github.com>`, and comments and pull requests use the `GYJ99` token identity.

## Fork workflow noise

This fork inherits many upstream workflows. Some depend on OpenCode organization-only Blacksmith runners, application secrets, deployment credentials, or release infrastructure and may stay queued or fail in a personal fork. Disable those inherited workflows in the fork if they produce notifications; do not disable **OpenCode upstream contributor**. The contributor workflow itself uses GitHub-hosted `ubuntu-latest`.
