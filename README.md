# Review Request Tool

One-tap Google review sender for DDS clients. The business owner opens a client URL, picks a draft, fills in the customer's name and phone, and taps **Open Messages**. The phone's native texting app opens with the message already written. Nothing is sent from a server.

Live shape: `https://YOUR-SITE.netlify.app/?client=toby`

> **Client JSON files are public.** Everything in `clients/*.json` is in a public
> repo and served to anyone at `/clients/<slug>.json`. Never put a key, token,
> password or any other secret in them. `scripts/check_clients.js` fails if one
> shows up.

## Stack
- Plain HTML / CSS / JS
- One JSON file per client in `/clients`
- Static hosting on Netlify, plus one Netlify Function (`netlify/functions/review-send.js`) that relays the send log to Nexus

Adding client #2 is a new file. Never a code change.

## Local preview

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/?client=toby

The static server can't run the function, so send-log POSTs 404 locally. That's
harmless: logging is best-effort and never blocks Open Messages or Copy text.
`netlify dev` runs the page and the function together.

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
| `nexusClientSlug` | no | Nexus client slug for send logging. Not secret. Blank = logging off. |

There is no key field. A leftover `nexusApiKey` is ignored by the app and must be deleted.

Tokens inside draft strings, replaced at preview/send time:

- `{cust}` — customer first name (falls back to `there`)
- `{biz}` — `bizName`
- `{owner}` — `ownerName`
- `{link}` — `reviewLink`

## Current clients

| URL | Business |
|---|---|
| `?client=toby` | Signature Tree and Home |
| `?client=mna` | M&A Stump Grinding |
| `?client=asm` | All Structure Maintenance |
| `?client=dages` | Dages Services |

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

## Send logging (Nexus)

After Open Messages or Copy text, the page POSTs the send event to
`/.netlify/functions/review-send`. The function validates it (POST + JSON only,
2 KB max, same-site Origin/Referer, known client, known fields) and forwards the
same body to Nexus `POST /api/v1/review-sends`, adding `X-Review-Send-Key`
server-side. The key never reaches the browser or the repo. If it fails, the
owner never notices.

### Adding a client's Nexus key

1. Set `nexusClientSlug` in `clients/{slug}.json`.
2. Add the client to `CLIENTS` in `netlify/functions/review-send.js`:
   `{slug}: { nexusClientSlug: "...", keyEnv: "NEXUS_KEY_{SLUG}" }`.
   The slug → env var mapping lives in code on purpose. Run `node scripts/check_clients.js`.
3. In Netlify: **Site configuration → Environment variables** → add
   `NEXUS_KEY_{SLUG}` with the key from Nexus, scoped to **Functions**. Mark it secret.
4. Deploy, then do one real send and confirm the row appears in Nexus.

A listed client with no env var set gets a quiet `200` and nothing is forwarded.

| Env var | Client |
|---|---|
| `NEXUS_KEY_TOBY` | `?client=toby` (Nexus `signature_tree`) |
| `NEXUS_KEY_MNA` | `?client=mna` (Nexus `ma_stump_grinding`) |
| `NEXUS_BASE_URL` | Optional. Overrides `https://nexus.digitaldynamicsolution.com` |
| `ALLOWED_ORIGINS` | Optional. Extra allowed origins (comma-separated), for example a custom domain if the Origin check ever rejects it |

To rotate a key, generate a new one in Nexus, update the env var, and redeploy.
Netlify only picks up env var changes on a new deploy.

## Deploy

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import from Git** → this repo
3. Publish directory: `.` (already set in `netlify.toml`)
4. Give the owner their URL with `?client=their-slug`
5. Test Open Messages on a real iPhone and a real Android before calling it done
