# Document house style

The voice and format every generated document follows. Loaded by `document-author` (and future document skills) before composing. Documents are more formal than outreach emails; for tone continuity see `rockcap-outreach-voice.md`, but default to a precise, evidence-led register here.

## Voice
- UK English. Precise and factual. No marketing fluff, no superlatives.
- Evidence-led: every figure is grounded in gathered data. Where natural, name the source in-text ("per the charge register", "from the latest filed accounts").
- Never state a figure you cannot ground. If a fact is missing, omit it or mark it plainly as "not on file". Do not estimate or infer silently.

## Composing `contentHtml`
The skill passes semantic HTML as `contentHtml`. The renderer wraps it in house CSS, so:
- Use semantic tags only: one `<h1>` (title), `<h2>` (sections), `<h3>` (sub-points), `<p>`, `<ul>`/`<li>`, `<table>` for any set of three or more figures, and `<span class="label">` for small monospace labels.
- Do NOT include `<html>`, `<head>`, `<style>`, or inline `style=` attributes. Styling is the renderer's job.
- Exactly one `<h1>`.

## Structure defaults
- Open with the `<h1>` title, then a one-line standfirst `<p>` (what this is, about whom).
- Group content into `<h2>` sections. Put related figures in a `<table>` rather than prose.
- Dates as `DD Mon YYYY` (e.g. 14 Nov 2025). Money as `£X.Xm` or `£XXk`. Percentages to one decimal.

## Hard prohibitions
- No fabricated figures, valuations, or track record.
- No invented GDV, loan amount, lender, or scheme not present in the data.
- No speculation framed as fact. Mark genuine inference as such ("suggests", "appears").
- Omit empty sections rather than padding them.
