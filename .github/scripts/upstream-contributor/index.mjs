import { fail, phase, validate } from "./common.mjs"
import { implement } from "./implement.mjs"
import { scan } from "./scan.mjs"

try {
  validate()
  if (phase === "scan") await scan()
  else await implement()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
