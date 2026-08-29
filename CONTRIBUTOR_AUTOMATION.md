# OpenCode upstream contribution automation

This fork contains a conservative workflow for contributing to `anomalyco/opencode` as `GYJ99`.

## State machine

1. **Observe**: scan and report one suitable candidate without writing upstream.
2. **Claim**: post one concise request for assignment, then wait.
3. **Autopilot**: after a maintainer assigns the issue to `GYJ99`, create a focused patch, run checks, push a branch to this fork, and open an upstream pull request.

The workflow never self-assigns an upstream issue. It also pauses while an upstream pull request by `GYJ99` is open or while an assignment request is pending.

## Required repository secrets

Create these under **Settings → Secrets and variables → Actions → Secrets**:

- `CONTRIBUTOR_GITHUB_TOKEN`: a `GYJ99` personal access token used for upstream comments, fork branch pushes, and pull-request creation. For contribution to a public organization repository where the user is not a member, a classic token with `public_repo` is currently the compatible GitHub option. Set an expiration and do not place the token in files or logs.
- `OPENCODE_API_KEY`: the OpenCode Zen or OpenCode Go API key used by the implementation agent.

## Required repository variables

Create these under **Settings → Secrets and variables → Actions → Variables**:

- `CONTRIBUTOR_BOT_ENABLED`: set to `true` only after the secrets are configured.
- `CONTRIBUTION_MODE`: `observe`, `claim`, or `autopilot`. Start with `observe`.
- `CONTRIBUTOR_MODEL`: a current OpenCode model ID in `provider/model` form. Check the current ID with `/models` before enabling autopilot.
- `CONTRIBUTOR_PR_DRAFT`: `true` by default. Set to `false` only when ready PR submission is desired.

Optional limits:

- `CONTRIBUTOR_MAX_CHANGED_FILES`: default `12`.
- `CONTRIBUTOR_MAX_DIFF_LINES`: default `800`.
- `CONTRIBUTOR_MAX_CHANGED_BYTES`: default `2000000`.

## Schedule and manual runs

The workflow scans hourly at minute 17 UTC. It can also be run manually from **Actions → OpenCode upstream contributor → Run workflow**, with an optional upstream issue number.

Recommended rollout:

1. Run manually in `observe` mode.
2. Change to `claim` after checking the candidate quality.
3. Change to `autopilot` only after a maintainer assignment and one successful dry run.

## Guardrails

- One open pull request or one pending claim at a time.
- Issues younger than six hours are ignored to allow repository compliance checks to finish.
- Assigned, already-claimed, linked-PR, feature/design, support, billing, service-only, dependency, and workflow issues are excluded by default.
- The implementation process receives no GitHub token. Shell, external network, external directory, and subagent access are explicitly denied during code generation.
- Changes under `.github`, package manifests, lockfiles, credential-like paths, and common binary formats are rejected.
- The workflow runs `git diff --check`, repository lint, repository typecheck, and available tests for up to three changed packages before submitting.
- Commits use `GYJ99 <112795205+GYJ99@users.noreply.github.com>`, and comments and pull requests use the `GYJ99` token identity.
