# ATP-4 — Rich message formatting

## Goal

Posts reach the channel with real formatting — headings, lists, quotes, tables — instead of the
flat text they carry today.

## Background

Bot API 10.1 (11 June 2026) added `sendRichMessage`, and 10.2 (14 July 2026) extended it. The
relevant facts, read from <https://core.telegram.org/bots/api>:

- `sendRichMessage` takes `rich_message` of type `InputRichMessage`. Ordinary `sendMessage` was not
  extended, and `parse_mode` has no effect on rich content.
- `InputRichMessage` — _"Exactly one of the fields html, markdown, or blocks must be used."_ So the
  model's output can be passed through as Markdown; there is no need to build a block tree.
- The Rich Markdown dialect covers `#`–`######`, ordered/unordered/task lists, blockquotes, fenced
  code, `---`, tables with alignment, footnotes, math, media by URL, and `<details><summary>`.
- Limits: 32768 characters, 500 blocks, 16 nesting levels, 50 media, 20 table columns.
- `editMessageText` gained `rich_message` ("required if text isn't specified"), and
  `sendRichMessage` accepts `reply_markup` — so the moderation card can still be edited in place and
  still carries its buttons.
- No Telegram Premium requirement is documented. The Premium gate reported in the press covers the
  client-side article editor for users, not the Bot API.

`editMessageCaption` did **not** gain a rich parameter. The photo-caption path and the rich path
therefore do not combine, which is what forces the media decision below.

## Decisions

**Media moves inline.** In rich mode the image is a leading `![](url)` in the Markdown rather than a
`sendPhoto` caption. That retires the `usedPhoto` branching for rich posts. If Telegram refuses the
image the send is retried once without it, preserving today's "a broken preview must not cost us the
post" behaviour.

**Link targets are shown to the moderator.** Formatting is not restricted, but the moderation card
gains an appendix listing every link in the draft with its target, rendered as inline code so it is
neither clickable nor able to disguise itself. Source content is untrusted input to the model, and
in rich mode its output is rendered rather than escaped — a link whose visible text differs from its
destination is exactly what manual approval would otherwise stop seeing.

**Rich by default, with a fallback.** No new column: if a rich send fails the code falls back to the
existing plain path, so a chat or client that cannot take rich messages still gets the post.

## Scope

1. `TelegramClient` — `sendRichMessage`, and `rich_message` on `editMessageText`.
2. `render.ts` — a rich path that does not escape the model's output, a Markdown footer, the 32768
   limit, and truncation that will not cut a fenced block or a table in half.
3. `links.ts` — extract every link target out of a Markdown document.
4. `card.ts` — rich card, links appendix, fallback.
5. `prompt.ts` — teach the model the dialect and its limits.
6. `publishPost.ts` — publish rich, fall back on failure.
7. `stripMarkdown` — reduces a draft to readable plain text on the fallback path. Without it a
   refused rich send puts `## Heading` and `**bold**` in front of a reader as literal characters,
   which is worse than the flat text this replaces.

## Out of scope

- A per-channel toggle. The automatic fallback covers the failure case; a switch can follow if one
  is wanted.
- `blocks` and `html` input. Markdown alone covers everything asked for here.
- Collages, slideshows, footnotes and math in the prompt instructions — the dialect supports them,
  but nothing in the pipeline produces them yet.
