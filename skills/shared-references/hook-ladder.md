# Hook ladder

The hook is the one personalised sentence in a cold send, sitting immediately after `I came across <Company> and wanted to reach out, `. Everything else in the opener is constant (see `rockcap-outreach-voice.md`). The hook is the differentiator: in the source corpus ~85% of sends carry a substantive hook and the generic-market fallback is used under 10% of the time.

**Provenance:** distilled from ~140 of Alex Lundberg's sent cold emails (Jan 2025 to May 2026). Ten distinct hook types, ranked strongest (most specific) first. Frequencies are approximate. The verbatim examples are real sent phrasings, anonymised with `[SCHEME]`, `[REGION]`, `[TOWN]` etc.

## How to use the ladder

1. Gather the prospect's intel: scheme names + addresses + what-they-are-building (`companies.getProspectSchemes`), charge density and lenders (`companies.getGroupCharges`), region (HubSpot city/county or charge particulars), web/planning findings (the `scheme-from-charges` step), lender tiers (`lender-tiers.md`).
2. **Apply the lender-tier gate first** (`lender-tiers.md`): Tier 1 lender means park (no send); Tier 2 means force the hook down to rung 10 (broad-brush) regardless of how much evidence exists. Do not telegraph CH research to a Tier 2 lender's borrower.
3. Otherwise pick the **highest rung where the evidence is confident and honest**. Drop to a weaker rung the moment the evidence runs out. A weak honest hook always beats a strong fabricated one.
4. Expose the chosen rung + the evidence used in the draft metadata, so the operator can upgrade manually or send as-is.

## The ten rungs

### 1. Architectural / construction detail (~10%, highest specificity)
A specific design or construction feature of a named scheme.
Verbatim: "the bay windows look lovely"; "The double height glass on your [SCHEME] scheme looks outstanding"; "I really like the brickwork on your [SCHEME] scheme"; "the focus on matching the local Yorkshire vernacular at the [SCHEME] development looks fantastic"; "the conversion of the Grade-II listed [HALL] into luxury apartments while retaining those original Gothic arched windows".
- **Our data:** the `scheme-from-charges` web/website research (`whatBuilding`, `sourceUrls`). Not derivable from charges alone. **Surface for human review; do not auto-generate.**

### 2. Named scheme + opening question (~20%, high specificity)
References a named scheme and asks an open question about its progress. Often the warmest cold hook.
Verbatim: "How is your [SCHEME] scheme progressing?"; "your [SCHEME] scheme looks like it is going to be stunning, when did you start on site?"; "how is your [SCHEME] scheme selling?"; "how are the second phases of your [SCHEME1] and [SCHEME2] schemes going?"; "Your scheme in [REGION] looks like a fantastic one".
- **Our data:** scheme names from `companies.getProspectSchemes` (parsed from CH charge particulars; e.g. "1, 2 & 3 The Arrows, Little Rissington") or confirmed by the website scrape. **Auto-attempt, flag for confirmation** the scheme is current.

### 3. Geographic personal connection (~8%, high specificity, personal)
Ties Alex's own life to the prospect's region. Disproportionately effective for regional developers.
Verbatim: "I grew up in [TOWN] and see you are really active there"; "I used to live the other side of [PARK] and my mum works locally"; "I'm fairly regularly down towards [REGION] as my dad lives there"; "I used to play rugby in [TOWN] so was shooting past [OTHER TOWN] all the time"; "I'm SW London based and always keen to connect with developers nearby".
- **Our data:** match the prospect's region against `sender-geography.md`. **Always human-confirm before send** (these are personal claims and must be true). Stronger than rung 4 when the overlap is genuine.

### 4. RockCap-active-in-region (~12%, geographic, low personal risk)
Same geographic angle using RockCap's recent deals, not Alex's personal connection.
Verbatim: "We are working on a handful of deals in [REGION] at the moment and are really keen to do more business in the area"; "we've done a fair bit of work in [REGION] but would love to do more"; "we have been doing more in [REGION] over the last 12 months".
- **Our data:** match the prospect's region against `rockcap-regional-activity.md`. **Auto-generate when a match exists.** Hard rule: regions only, never client names. The claim must be current; if activity is not current, reframe as historic ("we have done a lot of work in [region] historically and always keen to do more"). This is the category most amenable to automation.

### 5. Planning / acquisition / milestone event (~8%, high specificity, time-sensitive)
"Congratulations on [specific event]".
Verbatim: "Congratulations on obtaining planning on [SCHEME], how is the scheme coming along?"; "congratulations on the permission for your student scheme in [REGION]"; "congratulations on the acquisition in [TOWN]"; "Congratulations on the sales on [SCHEME]".
- **Our data:** the planning lookup in the `scheme-from-charges` step (planning portal, local press, LinkedIn). **Surface events as candidates.** None of this is in the charge data; needs the research step.

### 6. LinkedIn / digital presence (~5%, growing)
Acknowledges a LinkedIn post or website content.
Verbatim: "I've seen some of your posts on LinkedIn, looks like you have some really exciting projects on at the moment"; "I saw a post about your submission for the [TYPE] in [TOWN]"; "the website is a lot more engaging and funny than the vast majority of people in the space"; "all the externals on your website look really high quality".
- **Our data:** web/LinkedIn research in the `scheme-from-charges` step. **Surface findings for review.**

### 7. Track record / scale acknowledgment (~10%, mid specificity, safe)
A complimentary acknowledgment of overall scale, breadth or quality. Safe fallback.
Verbatim: "your track record speaks for itself in terms of the number of quality schemes you've been delivering"; "Your schemes look phenomenal, delivering such quality across so many geographies is even more impressive"; "looks like you build a fantastic product in some really great locations"; "your track record across residential, student and mixed-use is really impressive".
- **Our data:** generatable from charge count + lender + the scheme list alone (`getGroupCharges` / `getProspectSchemes`). **Default fallback when no specific signal.** Apply the credit-attribution rule (`rockcap-outreach-voice.md`) for family/long-standing businesses.

### 8. Active schemes / busy period (~12%, mid specificity, the charge-density nod)
"Looks busy" framing, often combined with a specific question.
Verbatim: "looks like you have some really exciting schemes on at the moment"; "looks like you have had a busy period with a lot going on across the group's schemes"; "looks like a busy period for the business".
- **Our data:** charge density from `getGroupCharges` (5+ active charges across the group). **Strong default for charge-dense prospects.** This is the canonical "subtle charge-density nod", a free upgrade over the plain-market opener, and it is true without inventing anything.

### 9. Sub-sector match / RockCap recent deal (~5%, high specificity when available)
References a RockCap deal that matches the prospect's sector. Name the deal RockCap led on, never the prospect-side counterparty.
Verbatim: "we did some work on a co-living pipeline a client is building across the [REGION]"; "we've arranged funding on a couple of rental schemes in the [REGION]"; "we've done a couple of similar [TYPE] schemes".
- **Our data:** needs a sector-tagged recent-deal index (regions/sectors, no client names). We do not yet have this as structured data; treat as a future reference to build. Until then, surface for manual use. Hard rule: never name the prospect-side client.

### 10. Generic market (last resort, ~5%)
Verbatim: "how are you finding the market at the moment?"
- Use only when nothing stronger is honest, or when a Tier 2 lender forces broad-brush. Treat as a flag that more research could lift the hook.

### Not hooks (observed and rejected)
- **No hook at all** (straight to the ask): acceptable, suboptimal.
- **Pitch up front** ("We arrange debt & equity..." as the opener): a dead 2025 pattern, do not replicate.
- **Lender-history acknowledgment** ("your senior pattern with [Lender] looks like the kind of structuring we work with"): too forward for a cold first send. Lender DNA selects the template, it does not write the hook. Acceptable only on warm reconnect.

## Input to output mapping

| Rung | Auto from our data? | Needs research step? | Needs Alex's personal data? | Our source | Recommendation |
|---|---|---|---|---|---|
| 1 Architectural detail | No | Yes (website) | No | scheme-from-charges | Surface for review |
| 2 Named scheme question | Partial | Sometimes | No | getProspectSchemes scheme names | Auto-attempt, confirm |
| 3 Geographic personal | No | No | Yes | sender-geography.md | Surface, always confirm |
| 4 RockCap-active region | Yes (on match) | No | No | rockcap-regional-activity.md | Auto when match |
| 5 Planning / event | No | Yes (planning/news) | No | scheme-from-charges | Surface events |
| 6 LinkedIn / digital | No | Yes (scrape) | No | scheme-from-charges | Surface findings |
| 7 Track record / scale | Yes | No | No | getGroupCharges + schemes | Default fallback |
| 8 Active / busy | Yes (5+ charges) | No | No | getGroupCharges density | Strong default |
| 9 Sub-sector match | No (need deal index) | No | No | (future deal index) | Manual until built |
| 10 Generic market | Yes | No | No | n/a | Last resort / Tier 2 soften |

## Hook combinations

Some sends combine two rungs (named scheme + geographic, or planning + named scheme). Combining is allowed when both are honest and the sentence stays short. Lead with the more specific rung. Example (rungs 2 + 3): "Your [SCHEME] scheme looked fantastic, I used to live the other side of [PARK]".

## Cross-references

- `rockcap-outreach-voice.md` — the opener skeleton, greeting/subject, sign-off, quirks, hard rules.
- `lender-tiers.md` — the park/soften gate applied before rung selection.
- `rockcap-regional-activity.md` (rung 4) and `sender-geography.md` (rung 3) — the geographic data sources.
- `../sub-skills/compose-outreach-hook.md` — the procedure that runs this ladder against a prospect's intel.
- `../skills/prospect-intel/references/scheme-from-charges.md` — produces the scheme/address/what-building/planning evidence that powers rungs 1, 2, 5, 6, 8.
