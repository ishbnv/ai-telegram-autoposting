# Architecture

## Processes

The system runs as three Node processes plus the admin panel. Splitting them keeps a slow source
fetch or a stuck LLM call from blocking button presses in Telegram.

| Process       | Responsibility                                                                           |
| ------------- | ---------------------------------------------------------------------------------------- |
| `apps/api`    | REST API for the panel, session auth, serves the built panel in production               |
| `apps/worker` | Polls sources on a schedule, generates drafts, sends moderation cards, runs publish jobs |
| `apps/bot`    | Telegram long polling: callback buttons and reply-based text edits                       |

Each writes a row to `Heartbeat` on a timer, which is what the dashboard's "Worker: running" and
"Bot: running" indicators read.

Long polling is the default because it needs no domain and no TLS certificate — a self-hoster can
start with nothing but a VPS. Webhook mode stays available through configuration.

## Data flow

```
cron (worker)
  └─► SourceAdapter.fetch()          RSS | HTML selectors | Reddit
        └─► NewsItem                 deduplicated on (sourceId, externalId)
              └─► Pipeline picks fresh items matching its filters
                    └─► OpenRouter chat/completions   prompt + model from Prompt
                          └─► Post (PENDING_APPROVAL) + LlmCall (tokens, cost)
                                └─► moderation card in Telegram
                                      └─► [✅ Publish] pressed
                                            └─► Job(PUBLISH) ─► channel ─► Publication
```

## The moderation protocol

A draft is delivered to the moderation chat as a single message: the post body, a footer linking to
the source it came from, and an inline keyboard.

- **✅ Publish** — enqueues a publish job, then rewrites the card to show when it went out.
- **✏️ Edit** — the bot replies with a `ForceReply` prompt; the next message replying to it becomes
  the new post text, and the card is redrawn.
- **♻️ Regenerate** — runs the prompt again against the same news item.
- **❌ Reject** — marks the post rejected and drops the keyboard.

`callback_data` carries the action and the post id. Every transition is a conditional update:

```sql
UPDATE "Post" SET status = 'APPROVED' WHERE id = $1 AND status = 'PENDING_APPROVAL'
```

If the update matches zero rows the button was already handled, and the bot answers the callback
with a notice instead of acting twice. This is what makes a double tap safe — Telegram will happily
deliver the same press twice on a flaky connection.

The bot ignores updates from any chat that is not a known moderation chat.

## Queue

Jobs live in a Postgres table and are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`. This is a
deliberate choice not to run Redis: the workload is a handful of jobs per hour, the database is
already there, and job state is visible in the same place as everything else. The queue sits behind
a narrow interface, so moving to a broker later is a contained change rather than a rewrite.

## Trust boundaries

Two of them matter.

**Source content is untrusted input to an LLM.** A Reddit post can contain text aimed at the model
rather than at a reader. Fetched content is passed inside delimiters, and the system prompt tells
the model to treat it as data. The approval step is the backstop: a prompt injection that gets past
the model still has to get past a human looking at the card.

**Secrets never enter the database.** Bot token, OpenRouter key and the admin password hash are read
from the environment. The Settings screen reports whether a value is present, never what it is. The
repository is public, so nothing that looks like a credential belongs in schema, seeds or fixtures.

## Why there is no scheduled publishing

Posts have no `SCHEDULED` status and pipelines have no `autoPublish` flag. Approval is always a
human button press, so the extra states would only add ways for a post to reach a channel
unintentionally. If delayed publishing is added later it should extend the approval action, not
bypass it.
