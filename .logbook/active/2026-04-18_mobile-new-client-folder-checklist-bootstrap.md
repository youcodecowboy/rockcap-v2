# [CRITICAL] Mobile new-client flow must bootstrap base folders + checklist

Created: 2026-04-18
Status: active
Tags: #bug #critical #data #mobile
Source:
  - - 2026-04-18 — [bug CRITICAL] mobile new-client flow doesn't bootstrap base folder set + checklist — any client created from mobile is missing the templated folders used for document storage. Likely clients.createWithPromotion (and clients.create from mobile) skips the folder/checklist init that the web onboarding does. Investigate which mutation(s) run the bootstrap and ensure mobile hits the same path.
Priority: high

## Notes

- 2026-04-20 — Started work. Investigating whether web new-client onboarding has a folder+checklist bootstrap helper that mobile mutations (clients.createWithPromotion + clients.create) bypass.
