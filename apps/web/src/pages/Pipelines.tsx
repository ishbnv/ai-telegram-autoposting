import type { PipelineDto } from "@contracts"
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
import { apiClient, errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import {
  useChannels,
  usePipelines,
  usePrompts,
  useSources,
} from "@/store/resources"

import styles from "./Resource.module.scss"

type Draft = {
  name: string
  promptId: string
  channelId: string
  sourceIds: string[]
  cron: string
  include: string
  exclude: string
  maxPostsPerDay: number
  freshnessWindowHours: number
  isActive: boolean
}

const emptyDraft: Draft = {
  name: "",
  promptId: "",
  channelId: "",
  sourceIds: [],
  cron: "*/30 * * * *",
  include: "",
  exclude: "",
  maxPostsPerDay: 10,
  freshnessWindowHours: 48,
  isActive: true,
}

const splitList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

export function PipelinesPage() {
  const store = usePipelines()
  const prompts = usePrompts()
  const channels = useChannels()
  const sources = useSources()

  const [editing, setEditing] = useState<PipelineDto | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [open, setOpen] = useState(false)
  const [runNote, setRunNote] = useState<string | null>(null)

  useEffect(() => {
    void store.load()
    void prompts.load()
    void channels.load()
    void sources.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setOpen(true)
  }

  function startEdit(pipeline: PipelineDto) {
    setEditing(pipeline)
    setDraft({
      name: pipeline.name,
      promptId: pipeline.promptId,
      channelId: pipeline.channelId,
      sourceIds: pipeline.sourceIds,
      cron: pipeline.cron,
      include: pipeline.filters.include.join(", "),
      exclude: pipeline.filters.exclude.join(", "),
      maxPostsPerDay: pipeline.maxPostsPerDay,
      freshnessWindowHours: pipeline.freshnessWindowHours,
      isActive: pipeline.isActive,
    })
    setOpen(true)
  }

  async function submit() {
    const payload = {
      name: draft.name,
      promptId: draft.promptId,
      channelId: draft.channelId,
      sourceIds: draft.sourceIds,
      cron: draft.cron,
      filters: {
        include: splitList(draft.include),
        exclude: splitList(draft.exclude),
      },
      maxPostsPerDay: draft.maxPostsPerDay,
      freshnessWindowHours: draft.freshnessWindowHours,
      isActive: draft.isActive,
    }

    try {
      if (editing) {
        await store.update(editing.id, payload)
      } else {
        await store.create(payload)
      }
      setOpen(false)
    } catch {
      // Rendered by the dialog from the store.
    }
  }

  async function run(pipeline: PipelineDto) {
    try {
      await apiClient.pipelines.run(pipeline.id)
      setRunNote(`${pipeline.name} queued.`)
    } catch (error) {
      setRunNote(errorMessage(error))
    }
  }

  const toggleSource = (id: string) =>
    setDraft((current) => ({
      ...current,
      sourceIds: current.sourceIds.includes(id)
        ? current.sourceIds.filter((entry) => entry !== id)
        : [...current.sourceIds, id],
    }))

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Binds sources to a prompt and a channel on a schedule."
        actions={<Button onClick={startCreate}>Add pipeline</Button>}
      />

      {runNote ? <p className={styles.subtle}>{runNote}</p> : null}

      <DataState
        status={store.status}
        error={store.error}
        isEmpty={store.items.length === 0}
        emptyMessage="No pipelines yet. One needs a prompt, a channel and at least one source."
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.items.map((pipeline) => (
                <TableRow key={pipeline.id}>
                  <TableCell>
                    <div className={styles.stack}>
                      <span>{pipeline.name}</span>
                      <span className={styles.subtle}>
                        {channels.items.find(
                          (channel) => channel.id === pipeline.channelId
                        )?.title ?? "unknown channel"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{pipeline.sourceIds.length}</TableCell>
                  <TableCell className={styles.mono}>{pipeline.cron}</TableCell>
                  <TableCell>{formatDateTime(pipeline.lastRunAt)}</TableCell>
                  <TableCell>
                    <Badge variant={pipeline.isActive ? "default" : "outline"}>
                      {pipeline.isActive ? "active" : "paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button size="xs" onClick={() => void run(pipeline)}>
                        Run now
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(pipeline)}
                      >
                        Edit
                      </Button>
                      <ConfirmButton
                        size="xs"
                        variant="ghost"
                        confirmLabel="Delete pipeline?"
                        onConfirm={() => void store.remove(pipeline.id)}
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
        title={editing ? "Edit pipeline" : "Add pipeline"}
        pending={store.saving}
        error={store.error}
        onSubmit={() => void submit()}
      >
        <Field label="Name" htmlFor="pipelineName">
          <Input
            id="pipelineName"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>

        <Field label="Prompt">
          <Select
            value={draft.promptId}
            items={Object.fromEntries(
              prompts.items.map((prompt) => [prompt.id, prompt.name])
            )}
            onValueChange={(value) =>
              setDraft({ ...draft, promptId: String(value) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a prompt" />
            </SelectTrigger>
            <SelectContent>
              {prompts.items.map((prompt) => (
                <SelectItem key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Channel">
          <Select
            value={draft.channelId}
            items={Object.fromEntries(
              channels.items.map((channel) => [channel.id, channel.title])
            )}
            onValueChange={(value) =>
              setDraft({ ...draft, channelId: String(value) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a channel" />
            </SelectTrigger>
            <SelectContent>
              {channels.items.map((channel) => (
                <SelectItem key={channel.id} value={channel.id}>
                  {channel.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Sources" hint="At least one.">
          <div className={styles.sourceList}>
            {sources.items.length === 0 ? (
              <span className={styles.subtle}>No sources defined yet.</span>
            ) : (
              sources.items.map((source) => (
                <div key={source.id} className={styles.checkboxRow}>
                  <Switch
                    id={`source-${source.id}`}
                    checked={draft.sourceIds.includes(source.id)}
                    onCheckedChange={() => toggleSource(source.id)}
                  />
                  <label htmlFor={`source-${source.id}`}>{source.name}</label>
                </div>
              ))
            )}
          </div>
        </Field>

        <Field
          label="Schedule"
          htmlFor="cron"
          hint="Five-field cron, e.g. */30 * * * * for every half hour."
        >
          <Input
            id="cron"
            value={draft.cron}
            onChange={(event) =>
              setDraft({ ...draft, cron: event.target.value })
            }
          />
        </Field>

        <Field
          label="Must contain"
          htmlFor="include"
          hint="Comma separated. Leave blank to accept everything."
        >
          <Input
            id="include"
            value={draft.include}
            onChange={(event) =>
              setDraft({ ...draft, include: event.target.value })
            }
          />
        </Field>

        <Field
          label="Must not contain"
          htmlFor="exclude"
          hint="Comma separated."
        >
          <Input
            id="exclude"
            value={draft.exclude}
            onChange={(event) =>
              setDraft({ ...draft, exclude: event.target.value })
            }
          />
        </Field>

        <Field label="Max posts per day" htmlFor="maxPostsPerDay">
          <Input
            id="maxPostsPerDay"
            type="number"
            min={1}
            value={draft.maxPostsPerDay}
            onChange={(event) =>
              setDraft({ ...draft, maxPostsPerDay: Number(event.target.value) })
            }
          />
        </Field>

        <Field
          label="Only items newer than (hours)"
          htmlFor="freshnessWindowHours"
          hint="Older items are skipped, so a first run does not post last week's news."
        >
          <Input
            id="freshnessWindowHours"
            type="number"
            min={1}
            value={draft.freshnessWindowHours}
            onChange={(event) =>
              setDraft({
                ...draft,
                freshnessWindowHours: Number(event.target.value),
              })
            }
          />
        </Field>

        <div className={styles.checkboxRow}>
          <Switch
            id="pipelineActive"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, isActive: checked })
            }
          />
          <label htmlFor="pipelineActive">Active</label>
        </div>
      </FormDialog>
    </>
  )
}
