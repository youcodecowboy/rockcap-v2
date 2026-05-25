# Templates

Document templates skills populate. XLSX, DOCX, PDF forms. The actual files live here in their native formats; the `template.populate(template, data) → file` primitive (BL-5.6) consumes them.

Currently empty. Planned templates:

- `underwriting-model.xlsx` — the RockCap appraisal/underwriting model. Cells named for the input codes the codify-extraction primitive produces.
- `lender-submission-pack.docx` — the standard lender submission document with placeholders for the deal narrative, the financial summary, the sponsor profile.
- `client-indicative-terms.docx` — the indicative terms document sent to clients.
- `ic-paper.docx` — the IC paper template with structure for executive summary, deal mechanics, sponsor analysis, market view, risks, recommendation.
- `case-study.docx` — closed-deal case study template that becomes precedent material for future deals.
- `monitoring-report.docx` — periodic monitoring report template for post-drawdown clients.

For each template, a sidecar `name.template.md` documents:

- Which input codes the template expects (which fields populate which cells / sections).
- Required versus optional inputs.
- The shape of any embedded charts or computed fields.
- The latest version date and what changed.

Templates ship as part of the skills repo so changes propagate to every operator on a `git pull`. The populate primitive lives in the app; the templates and their docs live here.
