import type { ProxyDto, ProxyUsage } from "@contracts"
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

import { ConfirmButton } from "@/components/ConfirmButton"
import { DataState } from "@/components/DataState"
import { Field, FormDialog } from "@/components/FormDialog"
import { PageHeader } from "@/components/PageHeader"
import { useProxies } from "@/store/resources"

import styles from "./Resource.module.scss"

const USES: { value: ProxyUsage; label: string }[] = [
  { value: "SOURCE", label: "Fetching sources" },
  { value: "LLM", label: "OpenRouter" },
  { value: "TELEGRAM", label: "Telegram" },
]

type Draft = {
  label: string
  url: string
  usedFor: ProxyUsage
  isActive: boolean
}

const emptyDraft: Draft = {
  label: "",
  url: "",
  usedFor: "SOURCE",
  isActive: true,
}

export function ProxiesPage() {
  const store = useProxies()
  const [editing, setEditing] = useState<ProxyDto | null>(null)
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

  function startEdit(proxy: ProxyDto) {
    setEditing(proxy)
    // The stored URL is never sent back to the browser, so editing starts from
    // an empty field rather than showing a masked value that cannot be saved.
    setDraft({
      label: proxy.label,
      url: "",
      usedFor: proxy.usedFor,
      isActive: proxy.isActive,
    })
    setOpen(true)
  }

  async function submit() {
    try {
      if (editing) {
        await store.update(editing.id, {
          label: draft.label,
          usedFor: draft.usedFor,
          isActive: draft.isActive,
          ...(draft.url ? { url: draft.url } : {}),
        })
      } else {
        await store.create(draft)
      }
      setOpen(false)
    } catch {
      // Rendered by the dialog from the store.
    }
  }

  return (
    <>
      <PageHeader
        title="Proxies"
        description="Optional outbound proxies, one per use. Useful where OpenRouter or Telegram is blocked."
        actions={<Button onClick={startCreate}>Add proxy</Button>}
      />

      <DataState
        status={store.status}
        error={store.error}
        isEmpty={store.items.length === 0}
        emptyMessage="No proxies configured. Everything goes out directly."
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Used for</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.items.map((proxy) => (
                <TableRow key={proxy.id}>
                  <TableCell>{proxy.label}</TableCell>
                  <TableCell className={styles.mono}>{proxy.url}</TableCell>
                  <TableCell>
                    {USES.find((use) => use.value === proxy.usedFor)?.label ??
                      proxy.usedFor}
                  </TableCell>
                  <TableCell>
                    <Badge variant={proxy.isActive ? "default" : "outline"}>
                      {proxy.isActive ? "active" : "paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(proxy)}
                      >
                        Edit
                      </Button>
                      <ConfirmButton
                        size="xs"
                        variant="ghost"
                        confirmLabel="Delete proxy?"
                        onConfirm={() => void store.remove(proxy.id)}
                      >
                        Delete
                      </ConfirmButton>
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
        title={editing ? "Edit proxy" : "Add proxy"}
        pending={store.saving}
        error={store.error}
        onSubmit={() => void submit()}
      >
        <Field label="Label" htmlFor="proxyLabel">
          <Input
            id="proxyLabel"
            value={draft.label}
            onChange={(event) =>
              setDraft({ ...draft, label: event.target.value })
            }
          />
        </Field>

        <Field
          label="URL"
          htmlFor="proxyUrl"
          hint={
            editing
              ? "Credentials are never sent back to the browser. Leave blank to keep the current URL."
              : "http://user:pass@host:3128 — http, https and socks are accepted."
          }
        >
          <Input
            id="proxyUrl"
            value={draft.url}
            placeholder={editing ? "unchanged" : ""}
            onChange={(event) =>
              setDraft({ ...draft, url: event.target.value })
            }
          />
        </Field>

        <Field
          label="Used for"
          hint="Source fetching picks the proxy up on the next run. OpenRouter and Telegram clients are built at startup, so those two take effect after restarting the worker and the bot."
        >
          <Select
            value={draft.usedFor}
            items={Object.fromEntries(
              USES.map((use) => [use.value, use.label])
            )}
            onValueChange={(value) =>
              setDraft({ ...draft, usedFor: value as ProxyUsage })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USES.map((use) => (
                <SelectItem key={use.value} value={use.value}>
                  {use.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className={styles.checkboxRow}>
          <Switch
            id="proxyActive"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, isActive: checked })
            }
          />
          <label htmlFor="proxyActive">Active</label>
        </div>
      </FormDialog>
    </>
  )
}
