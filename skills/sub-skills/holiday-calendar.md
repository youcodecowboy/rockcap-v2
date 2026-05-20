# holiday-calendar

Determine whether a given date is a UK business day, the next or previous business day, and how many business days fall between two dates. Used by cadence-fire (skip-on-holiday logic), deal-triage (overdue-by-business-days calculations), and any skill that schedules outbound communications around UK working patterns.

## When to use

Anywhere business-day logic matters: chase timing, deadline arithmetic, scheduling outbound emails, cadence firing.

## Inputs

Mode-dependent:

For `isBusinessDay`:

- `date`: ISO date or datetime

For `nextBusinessDay` / `previousBusinessDay`:

- `from`: ISO date
- `skipDays?`: how many business days to skip (default 1)

For `businessDaysBetween`:

- `start`: ISO date
- `end`: ISO date

## Outputs

```ts
type BusinessDayCheck = {
  date: string;                          // ISO YYYY-MM-DD
  isBusinessDay: boolean;
  reason?: "weekend_saturday" | "weekend_sunday" | "bank_holiday";
  bankHolidayName?: string;
  region: "england_and_wales" | "scotland" | "northern_ireland" | "uk_wide";
};

type BusinessDayMove = { from: string; to: string; daysSkipped: number };

type BusinessDaysBetween = { start: string; end: string; count: number };
```

## UK bank holidays

The skill knows the UK bank-holiday calendar. As a self-contained reference (no external API needed for the foreseeable future since the list changes slowly):

- New Year's Day (1 January; substitute Monday if weekend)
- Good Friday (Friday before Easter Sunday)
- Easter Monday (Monday after Easter Sunday)
- Early May Bank Holiday (first Monday in May; with occasional moves)
- Spring Bank Holiday (last Monday in May)
- Summer Bank Holiday (last Monday in August)
- Christmas Day (25 December; substitute if weekend)
- Boxing Day (26 December; substitute if weekend)

Scotland adds:
- 2 January
- St Andrew's Day (30 November or substitute Monday)

Northern Ireland adds:
- St Patrick's Day (17 March or substitute)
- Battle of the Boyne (12 July or substitute)

Default region is `england_and_wales`. Operators can override via `region` argument when a deal's location implies a different jurisdiction.

## Workflow

### `isBusinessDay(date)`

1. Parse date.
2. Check if Saturday or Sunday → not a business day.
3. Check against the bank-holiday calendar for the region → not a business day if matched.
4. Otherwise business day.

### `nextBusinessDay(from, skipDays = 1)`

1. Start at `from + 1 day`.
2. Step forward until `isBusinessDay` returns true `skipDays` times.
3. Return the resulting date.

### `previousBusinessDay(from, skipDays = 1)`

1. Mirror of `nextBusinessDay` going backward.

### `businessDaysBetween(start, end)`

1. Iterate from start to end (exclusive of end-day or inclusive depending on caller; default exclusive).
2. Count business days.
3. Return the count.

## Style rules

CONVENTIONS apply. One that matters: skill is deterministic and pure. No external calls, no time-of-day handling (treat dates as days, not instants). For datetime inputs, the date portion is used; the time portion is ignored.

## Tool dependencies

None. The bank-holiday calendar lives in the skill itself as a constant; gets updated in the same PR when the UK government announces an extraordinary holiday.

## What goes wrong

1. **Date in a year the calendar does not cover**: skill returns `isBusinessDay` based on weekend check only and flags `region: "unknown_year"`. Caller may treat the answer as best-effort.
2. **Date in a region the skill does not differentiate** (e.g., the Isle of Man): skill defaults to `england_and_wales` and notes the simplification.
3. **Bank holiday added by extraordinary proclamation** (state funeral, royal event): the calendar needs editing. Skill is no help until the constant is updated.
4. **Timezone considerations**: skill works in local UK time only. Callers in non-UK contexts should convert before invoking.

## Implementation note

This sub-skill is pure logic; it should be implemented as a small utility module either in the MCP server (when it lands) or as a Convex `internalQuery` accessible to other Convex functions. The same calendar drives both the skill-facing logic and the app-facing logic; consistency matters.
