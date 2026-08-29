import {
  assignedTo,
  base,
  fail,
  getComments,
  getIssue,
  getTimeline,
  hoursSince,
  labels,
  login,
  marker,
  mode,
  output,
  postComment,
  requested,
  search,
  summary,
  upstream,
} from "./common.mjs"

const claimTtl = Math.max(24, Number.parseInt(process.env.CLAIM_TTL_HOURS || "168", 10) || 168)
const allowUi = (process.env.CONTRIBUTOR_ALLOW_UI || "false").toLowerCase() === "true"

function blocked(item) {
  const names = labels(item)
  const blockedLabels = [
    "feature",
    "feature request",
    "question",
    "discussion",
    "duplicate",
    "invalid",
    "wontfix",
    "needs info",
    "needs-info",
    "needs:compliance",
    "needs compliance",
    "support",
    "billing",
  ]
  if (names.some((name) => blockedLabels.some((part) => name.includes(part)))) return true

  if (!allowUi) {
    const visualLabels = ["ui", "ux", "frontend", "desktop", "tui", "opentui", "design"]
    if (names.some((name) => visualLabels.some((part) => name === part || name.includes(part)))) return true
  }

  const text = `${item.title || ""}\n${item.body || ""}`.toLowerCase()
  const serviceOnly = /\b(billing|payment|subscription|refund|invoice|quota accounting|usage accounting|account charge|credit balance|zen gateway|server-side gateway|provider outage|free usage exceeded|dependency bump|github action|ci workflow)\b/i
  if (serviceOnly.test(text)) return true

  if (!allowUi) {
    const visualOnly = /\b(desktop app|web ui|frontend|opentui|tui rendering|theme|dialog|modal|button|layout|sidebar|scrollbar|visual regression)\b/i
    if (visualOnly.test(text)) return true
  }

  if ((item.body || "").trim().length < 120) return true
  if ((item.body || "").length > 12_000) return true
  if ((item.comments || 0) > 20) return true
  if (hoursSince(item.created_at) < 6) return true
  return false
}

function score(item) {
  const names = labels(item)
  const body = item.body || ""
  let value = 0
  if (names.includes("good first issue")) value += 120
  if (names.includes("help wanted") || names.includes("help-wanted")) value += 100
  if (names.includes("perf") || names.includes("performance")) value += 70
  if (names.includes("bug")) value += 60
  if (/steps to reproduce|reproduction|repro/i.test(body)) value += 20
  if (/expected behavior|actual behavior/i.test(body)) value += 12
  if (/packages\/[a-z0-9_.@/-]+/i.test(body)) value += 18
  if (/```/.test(body)) value += 8
  value -= Math.min(item.comments || 0, 30) * 2
  if (body.length > 10_000) value -= 25
  value -= Math.min(hoursSince(item.created_at) / 24, 90) / 10
  return value
}

async function hasOpenLinkedPull(number) {
  const events = await getTimeline(number)
  return events.some((event) => {
    const source = event.source?.issue
    return Boolean(source?.pull_request && source.state === "open")
  })
}

async function claimState(number) {
  const list = await getComments(number)
  const own = list
    .filter((entry) => entry.user?.login?.toLowerCase() === login.toLowerCase() && (entry.body || "").includes(marker))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  const pattern = /\b(i(?:'d| will| can| would like to)?\s+(?:work on|take|handle|implement|fix)\s+(?:this|it)|working on this)\b/i
  const other = list.some((entry) => {
    if (entry.user?.login?.toLowerCase() === login.toLowerCase()) return false
    if (hoursSince(entry.created_at) > 24 * 30) return false
    return pattern.test(entry.body || "")
  })

  return { own, other }
}

async function openPulls() {
  return search(`repo:${upstream} is:pr is:open author:${login}`, 20)
}

async function assignedIssues() {
  return search(`repo:${upstream} is:issue is:open assignee:${login}`, 20)
}

async function pendingClaim() {
  const items = await search(`repo:${upstream} is:issue is:open commenter:${login}`, 20)
  for (const item of items) {
    if (item.assignees?.length) continue
    const { own } = await claimState(item.number)
    if (own && hoursSince(own.created_at) <= claimTtl) return { item, own }
  }
  return null
}

async function candidate() {
  const queries = [
    `repo:${upstream} is:issue is:open no:assignee label:\"good first issue\"`,
    `repo:${upstream} is:issue is:open no:assignee label:\"help wanted\"`,
    `repo:${upstream} is:issue is:open no:assignee label:help-wanted`,
    `repo:${upstream} is:issue is:open no:assignee label:perf`,
    `repo:${upstream} is:issue is:open no:assignee label:bug`,
  ]
  const pool = new Map()
  for (const query of queries) {
    for (const item of await search(query, 50)) pool.set(item.number, item)
  }

  const ranked = [...pool.values()]
    .filter((item) => !item.pull_request && !item.assignees?.length && !blocked(item))
    .sort((a, b) => score(b) - score(a))

  for (const item of ranked.slice(0, 8)) {
    if (await hasOpenLinkedPull(item.number)) continue
    const claim = await claimState(item.number)
    if (claim.own || claim.other) continue
    return item
  }
  return null
}

function inferArea(item) {
  const text = `${item.title || ""}\n${item.body || ""}`
  const packageName = text.match(/packages\/([a-z0-9_.@-]+)/i)?.[1]
  if (packageName) return `\`packages/${packageName}\``
  if (/desktop|electron/i.test(text)) return "the desktop package"
  if (/\b(tui|terminal)\b/i.test(text)) return "the TUI"
  if (/\b(app|web ui|frontend)\b/i.test(text)) return "the app package"
  if (/\b(lsp|formatter)\b/i.test(text)) return "the affected integration"
  return "the affected code path"
}

async function requestAssignment(item) {
  const body = [
    "I'd like to work on this.",
    "",
    `I'll reproduce it against the current \`${base}\` branch, keep the change scoped to ${inferArea(item)}, and add or update a focused regression test where practical. Please assign it to \`${login}\` if this direction is acceptable.`,
    "",
    marker,
  ].join("\n")
  await postComment(item.number, body)
  summary(`### Claim requested\n\n- Issue: #${item.number} — ${item.title}\n- Mode: ${mode}\n- The workflow will wait for a maintainer to assign \`${login}\`.`)
}

export async function scan() {
  output("action", "none")
  output("issue", "")

  const pulls = await openPulls()
  if (pulls.length) {
    summary(`### Paused\n\nAn upstream pull request by \`${login}\` is already open: #${pulls[0].number} — ${pulls[0].title}. No new issue will be claimed.`)
    return
  }

  const assigned = await assignedIssues()
  if (assigned.length) {
    const item = requested ? assigned.find((value) => value.number === requested) : assigned[0]
    if (!item) fail(`Issue #${requested} is not currently assigned to ${login}`)
    summary(`### Assigned issue found\n\n- Issue: #${item.number} — ${item.title}\n- Mode: ${mode}`)
    if (mode === "autopilot") {
      output("action", "implement")
      output("issue", item.number)
    }
    return
  }

  const pending = await pendingClaim()
  if (pending) {
    summary(`### Waiting for assignment\n\n- Issue: #${pending.item.number} — ${pending.item.title}\n- Claim age: ${hoursSince(pending.own.created_at).toFixed(1)} hours\n- Claim timeout: ${claimTtl} hours\n- No additional issue will be claimed.`)
    return
  }

  let item = null
  if (Number.isInteger(requested)) {
    item = await getIssue(requested)
    if (item.pull_request || item.state !== "open") fail(`Issue #${requested} is not an open issue`)
    if (item.assignees?.length && !assignedTo(item, login)) fail(`Issue #${requested} is assigned to another contributor`)
    if (blocked(item)) fail(`Issue #${requested} does not pass the current policy filters`)
    if (await hasOpenLinkedPull(item.number)) fail(`Issue #${requested} already has an open linked pull request`)
    const claim = await claimState(item.number)
    if (claim.other) fail(`Issue #${requested} appears to be claimed by another contributor`)
    if (claim.own) fail(`Assignment has already been requested for issue #${requested}`)
  } else {
    item = await candidate()
  }

  if (!item) {
    summary("### No suitable candidate\n\nNo unassigned, unclaimed, policy-compatible issue passed the conservative filters.")
    return
  }

  summary(`### Candidate\n\n- Issue: #${item.number} — ${item.title}\n- Score: ${score(item).toFixed(1)}\n- Mode: ${mode}`)
  if (mode === "claim" || mode === "autopilot") await requestAssignment(item)
}
