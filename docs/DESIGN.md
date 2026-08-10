# Design

The admin panel is a dense, monochrome tool. It is meant to be read quickly and
not to be looked at for long. These are the rules that keep it coherent as pages
get added.

## Two styling layers, no overlap

| Layer             | What it carries                                                           | Where it lives             |
| ----------------- | ------------------------------------------------------------------------- | -------------------------- |
| Tailwind + shadcn | Anything componentish: controls, colour, states, typography               | class names in TSX         |
| SCSS modules      | Page and layout composition: grids, column widths, spacing between blocks | co-located `*.module.scss` |

`packages/ui/src/styles/globals.css` is the token layer — the Tailwind v4 theme,
the colour ramp and `--radius`. It stays plain CSS because `@import "tailwindcss"`,
`@theme` and `@custom-variant` are compiler directives that Sass would mangle. It
is the only hand-written `.css` file in the repository.

## Spacing: 4px base unit

Every gap, padding and margin is a multiple of 4px. The scale lives in
`apps/web/src/styles/_tokens.scss` and is injected into every module by
`vite.config.ts`, so there is no import to forget:

```scss
$space-1: 4px;
$space-2: 8px;
$space-3: 12px;
$space-4: 16px;
$space-5: 20px;
$space-6: 24px;
$space-8: 32px;
$space-10: 40px;
$space-12: 48px;
$space-16: 64px;
```

Use the variables, not raw values. A number that is not on the scale is a sign
the layout wants a different structure rather than a 7px nudge.

Fixed sizes that are not spacing — a sidebar width, a max column width — still
land on the grid: `240px`, `320px`, `544px`.

## Radius: nothing is square

There is one knob, `--radius` in `globals.css`, currently `0.75rem`. Every other
radius derives from it through the shadcn scale (`--radius-sm` … `--radius-4xl`),
so our surfaces and the component library round identically. Three semantic
aliases cover our own styles:

```scss
$radius-control: var(--radius-md); // inputs, chips, small buttons
$radius-surface: var(--radius-lg); // cards, rows, list containers
$radius-panel: var(--radius-xl); // tables, stat tiles, empty states
```

Tables get their radius from a bordered wrapper with `overflow-x: auto`, which
clips the corners and gives horizontal scrolling at the same time. The last row
drops its bottom border so it does not double up with the wrapper's edge.

Deliberate exception: 1px dividers _inside_ a container — between rows of a
table, between entries in the model list — are straight lines, not rounded
shapes. The rule is about surfaces, not separators.

## Type scale

```scss
$text-xs: 0.75rem; // hints, table meta, prices
$text-sm: 0.8125rem; // secondary body, monospace values
$text-base: 0.875rem; // default body
$text-lg: 1rem; // sidebar brand
$text-xl: 1.375rem; // page title
$text-2xl: 1.5rem; // stat value
```

Headings use `var(--font-heading)`; everything else inherits Inter from the
theme. Monospace is reserved for values a person may need to copy or compare
character by character: chat ids, model slugs, cron expressions, proxy URLs.

## Desktop-first

Layout is authored for the wide case and narrowed with `max-width` queries, in
that order. Two breakpoints, both from the tokens file:

```scss
$bp-tablet: 1024px; // two-column dialogs collapse to one
$bp-mobile: 768px; // sidebar becomes a horizontal bar
```

This is an operator's tool used at a desk. Phone support means "readable and
usable", not "equivalent".

## Dialogs

A form dialog is single-column by default. When a form has a clear split between
_what it produces_ and _how it runs_ — the prompt editor is the case today — use
`DialogColumns` with the authored content on the left and the knobs on the right,
and pass `wide` to the dialog. Below `$bp-tablet` it collapses to one column in
source order, so the left column must be the one that matters most.

Columns stretch to the height of the taller one. Mark the field that should
absorb the leftover space with `grow` — at most one per column — and its textarea
fills the gap instead of leaving a hole under a short form.

Nothing important goes below the fold of the scrollable body. A control the
operator needs but cannot see, such as an active/paused switch, belongs in the
shorter column.

## Density

Tables carry a lot of rows, so cells stay tight and long text is clipped to one
line with an ellipsis rather than wrapped. A cell that needs two lines gets a
`.stack` with a hard `max-width`: without one, a single long URL or system
prompt widens the whole table and pushes the action buttons out of view.

## Colour

Monochrome by default — the theme's neutral ramp carries structure, and colour
is reserved for meaning: `--destructive` for failures and destructive actions,
green for a healthy heartbeat. Adding a brand accent means adding it to the
theme, not to a component.
