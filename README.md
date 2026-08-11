# AI Telegram Autoposting

Self-hosted autoposting for Telegram channels. It watches your content sources, drafts a post
with the LLM of your choice through [OpenRouter](https://openrouter.ai), and sends the draft to a
Telegram chat with approval buttons. Nothing reaches your channel until you tap **Publish**.

> **Status:** under active development. The architecture is settled; features land stage by stage.

## How it works

```
RSS / your site / Reddit
        │  worker polls on a schedule, deduplicates
        ▼
    NewsItem  ──►  OpenRouter (your prompt, your model)
                        │
                        ▼
              draft post + cost recorded
                        │
                        ▼
   Telegram moderation chat:
   post text + "🔗 Source: …" footer
   [✅ Publish] [✏️ Edit] [♻️ Regenerate] [❌ Reject]
                        │  you tap Publish
                        ▼
                 your channel
```

## Screenshots

The admin panel, running against example data.

![The Overview dashboard: live process indicators, counters for published and pending posts, LLM
spend, and the list of collected items](docs/images/overview.png)

<details>
<summary>Sources, pipelines and the prompt editor</summary>

Sources of all three kinds, with the last fetch and any error kept in view:

![The Sources page listing an RSS feed, a subreddit and a scraped HTML page, one of them paused
after a 404](docs/images/sources.png)

Pipelines bind sources to a prompt and a channel on a cron schedule:

![The Pipelines page, each row showing its source count, cron expression and last
run](docs/images/pipelines.png)

The prompt editor picks a model from the live OpenRouter catalogue and shows what it costs:

![The prompt editor with the system prompt on the left and model, temperature, token limit and
user template on the right](docs/images/prompt-editor.png)

</details>

## Features

- **Sources** — RSS/Atom, plain HTML pages via CSS selectors, and Reddit. Deduplicated per source.
- **Prompts** — system prompt, model, temperature and token limits, picked from the live OpenRouter
  model catalogue with current prices.
- **Pipelines** — bind sources to a prompt and a channel, with keyword filters and a schedule.
- **Approval in Telegram** — every draft arrives as a card with buttons. Edit the text by replying
  to the card. There is no auto-publish path anywhere in the codebase.
- **Source attribution** — each post carries a configurable footer linking back to where the
  information came from.
- **Cost tracking** — every LLM call is recorded with token counts and dollar cost.
- **Proxies** — optional per-use proxies for LLM, source fetching, and Telegram.

## Quick start

Requirements: Docker. Node 22+ and pnpm as well if you want to work on the code.

```bash
git clone <your-fork-url> && cd ai-telegram-autoposting
cp .env.example .env
```

Fill in the four values described below, then bring the whole thing up:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

That builds one image and runs four services from it: Postgres, a one-shot `migrate` that applies
pending migrations and exits, then the API, the worker and the bot. The admin panel is served by the
API on <http://localhost:3000>.

To work on the code instead, run Postgres in Docker and everything else on the host:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

In that mode the panel runs on <http://localhost:5173> with hot reload and proxies `/api` to the API
on port 3000.

Either way, `.env` needs four values first.

### Admin password

```bash
pnpm --filter @workspace/api hash-password
```

Type your password at the prompt. The command prints a `scrypt:…` string — that is
`ADMIN_PASSWORD_HASH`. The password is read from stdin rather than an argument, so it never lands
in your shell history or in the process list.

Paste it into `.env` unquoted. Values in that file are read by Docker Compose, which strips quotes
in some places but not others, and expands `$NAME` inside them — which is why the hash is
separated by colons rather than the `$` these hashes conventionally use. If you have a hash from an
earlier version it still works, but regenerate it before deploying with Compose. Any secret of your
own that contains a literal `$` needs it doubled: `pa$$word`.

### Session secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Put the output in `SESSION_SECRET`. Anything shorter than 32 characters is rejected at startup.

### Telegram bot and chat ids

Create a bot with [@BotFather](https://t.me/BotFather) and put its token in `TELEGRAM_BOT_TOKEN`.

For `TELEGRAM_MODERATION_CHAT_ID`, add the bot to the group you want to approve posts from, send
`/start@your_bot` there, then ask the bot what it saw:

```bash
curl -s "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates" | python3 -m json.tool
```

Look for `"chat": { "id": -400…, "type": "supergroup" }`. Group ids are negative.

Two things that catch people out:

- Bots have privacy mode on by default and only see messages addressed to them, which is why the
  message above has to be a command mentioning the bot. A plain "hello" produces an empty result.
- If a plain group is later upgraded to a supergroup, **its id changes** — `-400123456` becomes
  `-100400123456` — and drafts silently stop arriving. Make the group a supergroup first (Settings →
  Chat history for new members → Visible), then read its id.

The channel id is found the same way: make the bot an administrator of the channel, post anything,
forward that post to the bot in a direct message, and read `forward_from_chat.id` from `getUpdates`.
That value goes into the **Channels** page in the panel, not into `.env`.

## Putting it on a server

The API publishes on `127.0.0.1:3000` and Postgres on `127.0.0.1:5432`, so neither is reachable
from outside the host. Put a reverse proxy in front and terminate TLS there.

**HTTPS is required, not recommended.** The session cookie is issued with `Secure` whenever
`NODE_ENV=production` — which the compose file sets — so over plain HTTP the browser drops it: the
login request returns 200 and you stay logged out, with nothing in any log explaining why.

With nginx already on the host:

```bash
sudo cp docker/nginx/autoposting.conf.example /etc/nginx/sites-available/panel.example.com
sudo sed -i 's/panel\.example\.com/your.host.name/' /etc/nginx/sites-available/panel.example.com
sudo ln -s /etc/nginx/sites-available/panel.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.host.name
```

Point an `A` record at the server before running certbot — the HTTP-01 challenge resolves the name
and fetches a file over port 80, so it fails if DNS has not caught up yet. Renewal is handled by the
`certbot.timer` systemd unit that the package installs; `sudo certbot renew --dry-run` proves it.

To expose the API directly instead, with nothing in front, set `API_BIND=0.0.0.0` — and arrange
TLS some other way, or you will not be able to log in.

## Configuration

All configuration is read from the environment — see [`.env.example`](.env.example) for the full
list. Secrets are never stored in the database and never shown in the UI.

| Variable                      | What it is                                     |
| ----------------------------- | ---------------------------------------------- |
| `DATABASE_URL`                | Postgres connection string                     |
| `TELEGRAM_BOT_TOKEN`          | Bot token from @BotFather                      |
| `TELEGRAM_MODERATION_CHAT_ID` | Default chat that receives drafts for approval |
| `OPENROUTER_API_KEY`          | OpenRouter API key                             |
| `ADMIN_PASSWORD_HASH`         | scrypt hash of your admin panel password       |
| `SESSION_SECRET`              | Random string signing the session cookie       |

## Tech stack

Hono · Prisma · Postgres · React · Vite · Zustand · shadcn/ui on Base UI · Tailwind · Turborepo.

## Project layout

| Path                 | What it is                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| `apps/web`           | Admin panel (React + Vite + Zustand)                                      |
| `apps/api`           | REST API (Hono), session auth, serves the built panel in production       |
| `apps/worker`        | Source polling, LLM generation, publishing jobs                           |
| `apps/bot`           | Telegram long polling, moderation buttons                                 |
| `packages/ui`        | shadcn/ui components and theme                                            |
| `packages/db`        | Prisma schema, migrations, client                                         |
| `packages/core`      | Domain logic: source adapters, OpenRouter and Telegram clients, job queue |
| `packages/contracts` | zod schemas shared between the API and the panel                          |
| `packages/config`    | Environment parsing and logging                                           |

Architecture notes live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
