import { appendFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

export const upstream = process.env.UPSTREAM_REPO || "anomalyco/opencode"
export const apiRoot = process.env.GITHUB_API_URL || "https://api.github.com"
export const login = process.env.CONTRIBUTOR_LOGIN || "GYJ99"
export const email = process.env.CONTRIBUTOR_EMAIL || "112795205+GYJ99@users.noreply.github.com"
export const base = process.env.BASE_BRANCH || "dev"
export const token = process.env.CONTRIBUTOR_GITHUB_TOKEN || ""
export const mode = (process.env.CONTRIBUTION_MODE || "observe").toLowerCase()
export const phase = (process.env.CONTRIBUTOR_PHASE || "scan").toLowerCase()
export const requested = Number.parseInt(process.env.TARGET_ISSUE || "", 10)
export const marker = "<!-- gyj99-opencode-contributor:claim -->"

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "GYJ99-opencode-contributor",
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function retryDelay(response, attempt) {
  const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10)
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min((retryAfter + 1) * 1000, 5 * 60_000)

  const reset = Number.parseInt(response.headers.get("x-ratelimit-reset") || "", 10)
  const untilReset = reset * 1000 - Date.now() + 1000
  if (Number.isFinite(untilReset) && untilReset > 0) return Math.min(untilReset, 5 * 60_000)

  return [10_000, 30_000, 60_000][attempt - 1] || 60_000
}

export function validate() {
  if (!token) fail("Missing CONTRIBUTOR_GITHUB_TOKEN")
  if (!["observe", "claim", "autopilot"].includes(mode)) fail(`Unsupported CONTRIBUTION_MODE: ${mode}`)
  if (!["scan", "implement"].includes(phase)) fail(`Unsupported CONTRIBUTOR_PHASE: ${phase}`)
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase()
  const attempts = method === "GET" ? 4 : 1

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${apiRoot}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    })
    const text = await response.text()
    const data = text ? safeJson(text) : null
    if (response.ok) return data

    const retryable = [403, 429, 500, 502, 503, 504].includes(response.status)
    if (retryable && attempt < attempts) {
      const wait = retryDelay(response, attempt)
      console.warn(`GitHub API ${response.status}; retrying GET ${path} in ${Math.ceil(wait / 1000)} seconds`)
      await delay(wait)
      continue
    }

    const message = data?.message || text || response.statusText
    throw new Error(`GitHub API ${response.status}: ${message}`)
  }

  throw new Error(`GitHub API request failed after ${attempts} attempts: ${path}`)
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

export async function search(query, perPage = 30) {
  const data = await api(`/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}`)
  return data.items || []
}

export async function getIssue(number) {
  return api(`/repos/${upstream}/issues/${number}`)
}

export async function getComments(number) {
  return api(`/repos/${upstream}/issues/${number}/comments?per_page=100`)
}

export async function getTimeline(number) {
  return api(`/repos/${upstream}/issues/${number}/timeline?per_page=100`)
}

export async function postComment(number, body) {
  return api(`/repos/${upstream}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

export function output(name, value) {
  const file = process.env.GITHUB_OUTPUT
  if (file) appendFileSync(file, `${name}=${String(value)}\n`)
}

export function summary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, `${markdown.trim()}\n\n`)
  console.log(markdown)
}

export function labels(item) {
  return (item.labels || []).map((value) => (typeof value === "string" ? value : value.name || "").toLowerCase())
}

export function assignedTo(item, user) {
  return (item.assignees || []).some((value) => value.login?.toLowerCase() === user.toLowerCase())
}

export function hoursSince(value) {
  return (Date.now() - new Date(value).getTime()) / 3_600_000
}

export function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`)
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeout,
    maxBuffer: 50 * 1024 * 1024,
  })
}

export function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}
