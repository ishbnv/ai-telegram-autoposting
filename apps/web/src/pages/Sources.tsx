import type { CreateSourceInput, SourceDto, SourceTypeValue } from "@contracts"
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui"
import { useEffect, useState } from "react"

import { DataState } from "@/components/DataState"
import { Field, FormDialog } from "@/components/FormDialog"
import { PageHeader } from "@/components/PageHeader"
import { formatDateTime } from "@/lib/format"
import { useSources } from "@/store/resources"

import styles from "./Resource.module.scss"

const TYPES: { value: SourceTypeValue; label: string; hint: string }[] = [
  {
    value: "RSS",
    label: "RSS / Atom",
    hint: "Feed URL, including your own site.",
  },
  {
    value: "HTML",
    label: "HTML page",
    hint: "Scrape a page with CSS selectors.",
  },
  {
    value: "REDDIT",
    label: "Reddit",
    hint: "Subreddit URL, e.g. https://www.reddit.com/r/GeminiAI",
  },
]

type Draft = {
  type: SourceTypeValue
  name: string
  url: string
  isActive: boolean
  fetchIntervalSec: number
  itemSelector: string
  titleSelector: string
  linkSelector: string
  summarySelector: string
  imageSelector: string
  listing: "new" | "hot" | "top" | "rising"
  limit: number
  includeStickied: boolean
  includeNsfw: boolean
}

const emptyDraft: Draft = {
  type: "RSS",
  name: "",
  url: "",
  isActive: true,
  fetchIntervalSec: 900,
  itemSelector: "",
  titleSelector: "",
  linkSelector: "",
  summarySelector: "",
  imageSelector: "",
  listing: "new",
  limit: 25,
  includeStickied: false,
  includeNsfw: false,
}

function toPayload(draft: Draft): CreateSourceInput {
  const base = {
    name: draft.name,
    url: draft.url,
    isActive: draft.isActive,
    fetchIntervalSec: draft.fetchIntervalSec,
    proxyId: null,
  }

  if (draft.type === "HTML") {
    return {
      ...base,
      type: "HTML",
      config: {
        itemSelector: draft.itemSelector,
        linkAttribute: "href",
        imageAttribute: "src",
        dateAttribute: "datetime",
        ...(draft.titleSelector ? { titleSelector: draft.titleSelector } : {}),
        ...(draft.linkSelector ? { linkSelector: draft.linkSelector } : {}),
        ...(draft.summarySelector
          ? { summarySelector: draft.summarySelector }
          : {}),
        ...(draft.imageSelector ? { imageSelector: draft.imageSelector } : {}),
      },
    }
  }

  if (draft.type === "REDDIT") {
    return {
      ...base,
      type: "REDDIT",
      config: {
        listing: draft.listing,
        limit: draft.limit,
        includeStickied: draft.includeStickied,
        includeNsfw: draft.includeNsfw,
      },
    }
  }

  return { ...base, type: "RSS", config: {} }
}

export function SourcesPage() {
  const store = useSources()
  const [editing, setEditing] = useState<SourceDto | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void store.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setOpen(true)
  }

  function startEdit(source: SourceDto) {
    const config = source.config as Record<string, unknown>

    setEditing(source)
    setDraft({
      ...emptyDraft,
      type: source.type,
      name: source.name,
      url: source.url,
      isActive: source.isActive,
      fetchIntervalSec: source.fetchIntervalSec,
      itemSelector: String(config["itemSelector"] ?? ""),
      titleSelector: String(config["titleSelector"] ?? ""),
      linkSelector: String(config["linkSelector"] ?? ""),
      summarySelector: String(config["summarySelector"] ?? ""),
      imageSelector: String(config["imageSelector"] ?? ""),
      listing: (config["listing"] as Draft["listing"]) ?? "new",
      limit: Number(config["limit"] ?? 25),
      includeStickied: Boolean(config["includeStickied"]),
      includeNsfw: Boolean(config["includeNsfw"]),
    })
    setOpen(true)
  }

  async function submit() {
    const payload = toPayload(draft)

    try {
      if (editing) {
        // The type of an existing source is fixed: changing it would orphan the
        // items already collected under the old adapter's external ids.
        await store.update(editing.id, {
          name: payload.name,
          url: payload.url,
          isActive: payload.isActive,
          fetchIntervalSec: payload.fetchIntervalSec,
          config: payload.config as Record<string, unknown>,
        })
      } else {
        await store.create(payload)
      }
      setOpen(false)
    } catch {
      // Rendered by the dialog from the store.
    }
  }

  return (
    <>
      <PageHeader
        title="Sources"
        description="Where raw items are collected from."
        actions={<Button onClick={startCreate}>Add source</Button>}
      />

      <DataState
        status={store.status}
        error={store.error}
        isEmpty={store.items.length === 0}
        emptyMessage="No sources yet. Add an RSS feed or a subreddit to start collecting."
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Every</TableHead>
                <TableHead>Last fetch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.items.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className={styles.stack}>
                      <span>{source.name}</span>
                      <span className={styles.subtle}>{source.url}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{source.type}</Badge>
                  </TableCell>
                  <TableCell>{source.fetchIntervalSec / 60} min</TableCell>
                  <TableCell>
                    <div className={styles.stack}>
                      <span>{formatDateTime(source.lastFetchedAt)}</span>
                      {source.lastError ? (
                        <span className="text-xs text-destructive">
                          {source.lastError.slice(0, 120)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.isActive ? "default" : "outline"}>
                      {source.isActive ? "active" : "paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(source)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void store.remove(source.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit source" : "Add source"}
        pending={store.saving}
        error={store.error}
        onSubmit={() => void submit()}
      >
        <Field
          label="Type"
          hint={TYPES.find((type) => type.value === draft.type)?.hint}
        >
          <Select
            value={draft.type}
            items={Object.fromEntries(
              TYPES.map((type) => [type.value, type.label])
            )}
            onValueChange={(value) =>
              setDraft({ ...draft, type: value as SourceTypeValue })
            }
            disabled={editing !== null}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>

        <Field label="URL" htmlFor="url">
          <Input
            id="url"
            value={draft.url}
            onChange={(event) =>
              setDraft({ ...draft, url: event.target.value })
            }
          />
        </Field>

        <Field
          label="Check every (minutes)"
          htmlFor="interval"
          hint="Minimum one minute. Be considerate of the site you are polling."
        >
          <Input
            id="interval"
            type="number"
            min={1}
            value={draft.fetchIntervalSec / 60}
            onChange={(event) =>
              setDraft({
                ...draft,
                fetchIntervalSec: Math.max(60, Number(event.target.value) * 60),
              })
            }
          />
        </Field>

        {draft.type === "HTML" ? (
          <>
            <Field
              label="Item selector"
              htmlFor="itemSelector"
              hint="One element per item, e.g. article.post"
            >
              <Input
                id="itemSelector"
                value={draft.itemSelector}
                onChange={(event) =>
                  setDraft({ ...draft, itemSelector: event.target.value })
                }
              />
            </Field>
            <Field label="Title selector" htmlFor="titleSelector">
              <Input
                id="titleSelector"
                value={draft.titleSelector}
                onChange={(event) =>
                  setDraft({ ...draft, titleSelector: event.target.value })
                }
              />
            </Field>
            <Field
              label="Link selector"
              htmlFor="linkSelector"
              hint="Leave blank to use the first link inside the item."
            >
              <Input
                id="linkSelector"
                value={draft.linkSelector}
                onChange={(event) =>
                  setDraft({ ...draft, linkSelector: event.target.value })
                }
              />
            </Field>
            <Field label="Summary selector" htmlFor="summarySelector">
              <Input
                id="summarySelector"
                value={draft.summarySelector}
                onChange={(event) =>
                  setDraft({ ...draft, summarySelector: event.target.value })
                }
              />
            </Field>
            <Field label="Image selector" htmlFor="imageSelector">
              <Input
                id="imageSelector"
                value={draft.imageSelector}
                onChange={(event) =>
                  setDraft({ ...draft, imageSelector: event.target.value })
                }
              />
            </Field>
          </>
        ) : null}

        {draft.type === "REDDIT" ? (
          <>
            <Field label="Listing">
              <Select
                value={draft.listing}
                onValueChange={(value) =>
                  setDraft({ ...draft, listing: value as Draft["listing"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["new", "hot", "top", "rising"] as const).map((listing) => (
                    <SelectItem key={listing} value={listing}>
                      {listing}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Posts per fetch" htmlFor="limit">
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={draft.limit}
                onChange={(event) =>
                  setDraft({ ...draft, limit: Number(event.target.value) })
                }
              />
            </Field>

            <div className={styles.checkboxRow}>
              <Switch
                id="includeStickied"
                checked={draft.includeStickied}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, includeStickied: checked })
                }
              />
              <label htmlFor="includeStickied">Include stickied posts</label>
            </div>

            <div className={styles.checkboxRow}>
              <Switch
                id="includeNsfw"
                checked={draft.includeNsfw}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, includeNsfw: checked })
                }
              />
              <label htmlFor="includeNsfw">Include NSFW posts</label>
            </div>
          </>
        ) : null}

        <div className={styles.checkboxRow}>
          <Switch
            id="sourceActive"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, isActive: checked })
            }
          />
          <label htmlFor="sourceActive">Active</label>
        </div>
      </FormDialog>
    </>
  )
}
