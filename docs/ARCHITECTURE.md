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

Two separate checks gate every button and every edit, and conflating them was a
real bug:

1. **Is this chat allowed to talk to the bot at all?** The allowlist — the
   default moderation chat plus every channel's — answers this.
2. **Does this chat moderate _this_ post?** `callback_data` is client-supplied,
   so a modified client can name any post id. Without the second check, a
   moderator of one channel could publish another channel's draft.

An edit additionally has to be a reply to a message the bot itself sent. The
marker in the prompt body is not proof of that: anyone can type it.

## Queue

Jobs live in a Postgres table and are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`. This is a
deliberate choice not to run Redis: the workload is a handful of jobs per hour, the database is
already there, and job state is visible in the same place as everything else. The queue sits behind
a narrow interface, so moving to a broker later is a contained change rather than a rewrite.

## Delivery is not transactional

Telegram has no idempotency key, so "did this message go out?" cannot always be
answered. The publish path therefore treats three outcomes differently:

- **Telegram answered.** The post stays PUBLISHED even if recording it failed.
  Releasing it here is what would put a second copy in the channel.
- **Telegram refused with a 4xx.** It parsed the request and declined, which
  proves nothing was sent, so the post goes back in the queue.
- **Timeout or dropped connection.** Unknowable. The post is parked as FAILED
  for a human to check the channel, because an automatic retry might duplicate.

For the same reason the shared HTTP layer does not retry non-idempotent methods
on transport errors or 5xx — only on 429, which is an explicit "I did not
process this".

## Trust boundaries

Three of them matter.

**The login endpoint is the only pre-auth surface.** It is rate limited per
client, globally, and by the number of password verifications allowed to run at
once. The last one is the important one: scrypt costs ~33 MB per attempt, so
without a cap a flood of parallel logins is a memory amplifier that takes the
API down with no correct password at all. Limits are checked before the key
derivation runs, never after.

**Source content is untrusted input to an LLM.** A Reddit post can contain text aimed at the model
rather than at a reader. Fetched content is passed inside delimiters, and the system prompt tells
the model to treat it as data. The approval step is the backstop: a prompt injection that gets past
the model still has to get past a human looking at the card.

Keeping content inside those delimiters means defusing the tag _name_ in fetched values, not
deleting whole `<...>` tags. Deleting tags is one pass over the string, so the fragments either side
of a removed match get joined — `<</source_material>/source_material>` survives it as a working
close tag. Removing the name is linear and leaves nothing to rebuild a delimiter from.

**Secrets never enter the database.** Bot token, OpenRouter key and the admin password hash are read
from the environment. The Settings screen reports whether a value is present, never what it is. The
repository is public, so nothing that looks like a credential belongs in schema, seeds or fixtures.

## Why there is no scheduled publishing

Posts have no `SCHEDULED` status and pipelines have no `autoPublish` flag. Approval is always a
human button press, so the extra states would only add ways for a post to reach a channel
unintentionally. If delayed publishing is added later it should extend the approval action, not
bypass it.
