# Review Request Tool

One-tap Google review sender for DDS clients. The business owner opens a client URL, picks a draft, fills in the customer's name and phone, and taps **Open Messages**. The phone's native texting app opens with the message already written. Nothing is sent from a server.

Live shape: `https://YOUR-SITE.netlify.app/?client=toby`

## Stack
- Plain HTML / CSS / JS
- One JSON file per client in `/clients`
- Static hosting on Netlify

Adding client #2 is a new file. Never a code change.

## Local preview

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/?client=toby

## Client JSON schema

Copy `clients/_template.json` to `clients/{slug}.json` and fill it in.

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | URL key: `?client=slug` |
| `bizName` | yes | Shown in the header and `{biz}` token |
| `ownerName` | yes | `{owner}` token |
| `reviewLink` | yes | Real Google write-review URL. Never a placeholder. |
| `draftTemplates.first` | yes | Array of first-time customer texts |
| `draftTemplates.repeat` | yes | Array of repeat customer texts |
| `phone` | no | Owner's number, for reference |
| `accentColor` | no | Hex color for buttons and selection |
| `tagline` | no | Shown under the business name |
| `draftSource` | no | Where the drafts came from (agent output) |

Tokens inside draft strings, replaced at preview/send time:

- `{cust}` — customer first name (falls back to `there`)
- `{biz}` — `bizName`
- `{owner}` — `ownerName`
- `{link}` — `reviewLink`

## Current clients

| URL | Business |
|---|---|
| `?client=toby` | Signature Tree and Home |
| `?client=mna` | M&A Stump Grinding (swap in the real Google review link before going live) |

## SMS deep links

iOS and Android disagree on how to pre-fill the message body:

- Android: `sms:+15555551234?body=...`
- iOS: `sms:+15555551234&body=...`

The tool detects the platform and branches. **Copy text** is the desktop / fallback path.

## Agent handoff

Drafts are written by the Review Funnel agent in [dds-agents](https://github.com/monkeydluthy/dds-agents) (`prompts/review_funnel.md`). After the owner approves REQUEST DRAFTS, paste them into the client JSON. See [docs/AGENT_SYNC.md](docs/AGENT_SYNC.md).

```bash
python3 scripts/sync_from_agent.py \
  --markdown path/to/review_funnel_output.md \
  --client toby \
  --biz "Signature Tree and Home" \
  --owner Toby \
  --link "https://g.page/r/CYNcZC8tnZqhEBM/review"
```

## Deploy

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import from Git** → this repo
3. Publish directory: `.` (already set in `netlify.toml`)
4. Give the owner their URL with `?client=their-slug`
5. Test Open Messages on a real iPhone and a real Android before calling it done
