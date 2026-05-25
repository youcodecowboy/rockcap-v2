# match-register

Given an inbound communication, identify the register (formal, neutral, warm, casual) and produce style guidance for a reply or follow-up. Used by qualify-and-draft, cadence-fire, meeting-capture, and any skill that drafts outbound text mirroring an inbound style.

## When to use

Whenever the skill is composing outbound communication in response to inbound, or in continuation of a thread, and needs to match the counterparty's tone without over- or under-correcting.

## Inputs

Required (one of):

- `inboundText`: the text whose register we are matching (email body, transcript excerpt, prior message in thread)
- `priorTouchpointIds[]`: a thread of touchpoints; the most recent inbound determines the register

Optional:

- `relationshipAge`: how long we have known the counterparty (in months); used as a secondary signal
- `priorRegisterLabel`: a previously-determined label for the same counterparty; used for continuity

## Outputs

```ts
type RegisterMatch = {
  register: "formal" | "neutral" | "warm" | "casual";
  confidence: "high" | "medium" | "low";
  signals: string[];                     // the cues that drove the classification
  guidance: {
    greeting: string;                    // e.g., "Hi {firstName}" / "Dear {Mr. Lastname}"
    signoff: string;                     // e.g., "Best", "Kind regards", "Cheers"
    paragraphLength: "short" | "medium"; // sentences per paragraph
    firstNameBasis: boolean;
    contractionsAllowed: boolean;
    exclamationsAllowed: boolean;        // never more than one if true
  };
};
```

## Register definitions

- **formal**: full salutations, last-name basis, no contractions, no exclamation marks, "Kind regards" or "Yours sincerely". Used in first contact at senior level, regulated communications, written records of decision.
- **neutral**: first-name greeting ("Hi Sarah"), some contractions, no exclamations, "Best" or "Best regards". Default for most business communication.
- **warm**: first-name plus a personal opener ("Hi Sarah, hope the move went well"), contractions, occasional single exclamation, "Cheers" or "Best". Used for established relationships, internal team, sympathetic contexts.
- **casual**: borderline informal, slang allowed sparingly, "Cheers" or first-name-only signoff. Reserved for team-internal communication or counterparties we know very well.

## Workflow

1. Tokenise the inbound text. Count signals:
   - Salutation form: "Dear Sir/Madam" → formal; "Hi" → neutral or warmer; no salutation → neutral or warmer.
   - Contractions present ("we'll", "won't") → not formal.
   - Exclamation marks present → not formal; multiple → warm or casual.
   - First-person plural / personal disclosures → warm or casual.
   - Length: long structured paragraphs lean formal; short conversational lean warm.
2. Apply secondary signals: `relationshipAge` over 12 months allows warmer than the text alone suggests; under 3 months caps at neutral regardless of text warmth.
3. Apply continuity: if `priorRegisterLabel` is set and current text does not strongly contradict it, prefer continuity.
4. Output the register plus guidance.

## Style rules

CONVENTIONS apply. The register output is the input to other skills' style decisions; this sub-skill itself does not produce outbound text.

## Tool dependencies

- `touchpoint.get`, `touchpoint.getByThread` (for `priorTouchpointIds` mode)
- No external services

## What goes wrong

1. **Mixed register inbound** (formal subject line, warm body): skill picks based on body content and notes the mismatch in `signals`.
2. **Counterparty's first language is not English**: register signals less reliable. Skill defaults to neutral if confidence is low.
3. **The thread has drifted register over time** (started formal, became warm): skill uses the most recent inbound, not the chain average.
4. **Inbound is auto-generated** (a Calendly invite, a CRM-triggered email): skill detects and recommends neutral plus no personalisation.
