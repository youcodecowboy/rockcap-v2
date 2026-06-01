# Turning feedback into a durable change

The most valuable thing an operator does is say "this output was wrong" (or
"this was great"). The job is to convert that judgement into a change to the
skill so the behaviour improves *next time, automatically* — not a one-off fix.

## The loop

1. **Capture the example.** Get the actual output the operator is reacting to,
   and what they wanted instead. Be specific: "too formal," "missed the
   guarantor," "wrong lender tier."

2. **Diagnose the cause.** Trace the behaviour to its source in the skill:
   - Is it a missing/weak instruction in the `SKILL.md` workflow?
   - Is it a reference file that's wrong, stale, or missing (e.g. a voice rule,
     a house-style doc, a tier definition)?
   - Is it a template that needs a field or a different structure?
   - Is it a genuinely new case the skill never covered?
   Name the cause before editing. Don't patch symptoms blindly.

3. **Make the smallest durable fix.** Edit the instruction or reference that
   caused it. Prefer strengthening a reference (it's reused) over adding a
   special-case line to the workflow.

4. **Bank the example (optional but encouraged).** Add the before/after to the
   skill's `corpora/` (anonymised) so it becomes a worked example the skill can
   draw on. This is how skills harden over time.

5. **Validate and save** through the normal skill-forge path.

## Good vs bad examples both help

- A **bad** output → fix the cause so it can't recur.
- A **good** output → consider banking it as an exemplar the skill points to,
  so the quality bar is captured, not just remembered.

## Keep it honest

If the fix would require a tool the app doesn't have, that's not a skill change —
it's a feature request for the app team. Say so; don't fake it with a
non-existent tool (the gate will block it anyway).
