# Agent → review-request-tool sync

Phase 4 of the review tool. The Review Funnel agent (DDS agent #16) writes
the message drafts. This file is the repeatable path from that output into a
client JSON file.

Automated write-back is deferred. Manual paste (or the helper script below) is
the v1 process.

## Where drafts come from

Repo: `https://github.com/monkeydluthy/dds-agents`
Prompt: `prompts/review_funnel.md`
Client brain: `clients/{client}.json` (review link lives at
`platforms.google_business_profile.review_link` and `review_funnel.review_link`)

Run it:

```bash
cd /path/to/dds-agents
python orchestrator.py review_funnel signature_tree "REQUEST DRAFTS only — text message variants for first-time and repeat customers, 3 of each, under 3 sentences, owner's voice, real review link"
```

Output lands in `dds-agents/outputs/` as markdown.

## Mapping

Only **TEXT MESSAGE** drafts go into the tool. Email, QR copy, responses, and
cadence stay in the agent output for other uses.

| Agent section | JSON path |
|---|---|
| TEXT MESSAGE — First-Time Customer | `draftTemplates.first[]` |
| TEXT MESSAGE — Repeat Customer | `draftTemplates.repeat[]` |

Token rewrite (do this before saving — the tool interpolates at send time):

| Agent writes | Tool JSON uses |
|---|---|
| `[First Name]` or the actual name | `{cust}` |
| Business name as written | `{biz}` |
| Owner sign-off name | `{owner}` |
| The Google review URL | `{link}` |

Rules that must still hold after conversion:

- Under 3 sentences
- One review link, via `{link}` — never a leftover `https://g.page/...` hardcode
- No fake-review or incentive language
- No leftover `[brackets]` or `{cust}`-style mistakes like `Hey {cust} {cust}`

## Checklist (after owner approval)

1. Owner signs off on the REQUEST DRAFTS section.
2. Copy each approved **text** variant into `clients/{slug}.json`.
3. Rewrite tokens as above.
4. Confirm `reviewLink` matches the client brain.
5. Commit the JSON file. Do not touch `index.html`, CSS, or JS.
6. Open `?client={slug}` and preview every card before sending the URL to the owner.

## Helper script

From this repo:

```bash
python3 scripts/sync_from_agent.py \
  --markdown ../dds-agents/outputs/2026-08-19_2328_review_funnel_signature_tree.md \
  --client toby \
  --biz "Signature Tree and Home" \
  --owner Toby \
  --link "https://g.page/r/CYNcZC8tnZqhEBM/review"
```

The script prints a `draftTemplates` object. Paste it into the client JSON
(or pass `--write` to merge it into `clients/{slug}.json`).

## Later (not v1)

The orchestrator writes approved drafts straight into this repo (or a database
row) after owner sign-off. Revisit once several clients are on the tool.
