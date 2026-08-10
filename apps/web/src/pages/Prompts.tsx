import type { PromptDto } from "@contracts"
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
  Textarea,
} from "@ui"
import { useEffect, useRef, useState } from "react"

import { DataState } from "@/components/DataState"
import {
  DialogColumn,
  DialogColumns,
  Field,
  FormDialog,
} from "@/components/FormDialog"
import { PageHeader } from "@/components/PageHeader"
import { usePrompts } from "@/store/resources"
import { useSettings } from "@/store/settings"

import promptStyles from "./Prompts.module.scss"
import styles from "./Resource.module.scss"

const DEFAULT_SYSTEM_PROMPT = [
  "You write short posts for a Telegram channel.",
  "",
  "Rules:",
  "- Three to five sentences. Plain language, no marketing tone.",
  "- At most one emoji. No hashtags.",
  "- Never state a fact that is not in the source material.",
].join("\n")

/** What each placeholder is replaced with when a draft is generated. */
const PLACEHOLDERS = [
  { token: "{title}", meaning: "headline of the collected item" },
  { token: "{url}", meaning: "link to the original" },
  { token: "{summary}", meaning: "short description, when the source has one" },
  { token: "{content}", meaning: "full text, when the source has one" },
]

type Draft = {
  name: string
  systemPrompt: string
  userTemplate: string
  model: string
  temperature: string
  maxTokens: string
  isActive: boolean
}

const emptyDraft: Draft = {
  name: "",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userTemplate: "{title}\n\n{content}",
  model: "",
  temperature: "0.7",
  maxTokens: "700",
  isActive: true,
}

export function PromptsPage() {
  const store = usePrompts()
  const settings = useSettings()
  const [editing, setEditing] = useState<PromptDto | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [open, setOpen] = useState(false)
  const templateRef = useRef<HTMLTextAreaElement>(null)

  const selectedModel = settings.models.find(
    (model) => model.id === draft.model
  )

  useEffect(() => {
    void store.load()
    void settings.loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setOpen(true)
  }

  function startEdit(prompt: PromptDto) {
    setEditing(prompt)
    setDraft({
      name: prompt.name,
      systemPrompt: prompt.systemPrompt,
      userTemplate: prompt.userTemplate,
      model: prompt.model,
      temperature: prompt.temperature?.toString() ?? "",
      maxTokens: prompt.maxTokens?.toString() ?? "",
      isActive: prompt.isActive,
    })
    setOpen(true)
  }

  /** Drops a placeholder where the caret is, rather than making people type it. */
  function insertPlaceholder(token: string) {
    const field = templateRef.current
    const at = field ? field.selectionStart : draft.userTemplate.length
    const next =
      draft.userTemplate.slice(0, at) + token + draft.userTemplate.slice(at)

    setDraft({ ...draft, userTemplate: next })

    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(at + token.length, at + token.length)
    })
  }

  async function submit() {
    const payload = {
      name: draft.name,
      systemPrompt: draft.systemPrompt,
      userTemplate: draft.userTemplate,
      model: draft.model,
      temperature: draft.temperature === "" ? null : Number(draft.temperature),
      maxTokens: draft.maxTokens === "" ? null : Number(draft.maxTokens),
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

  return (
    <>
      <PageHeader
        title="Prompts"
        description="How a collected item becomes a post, and which model writes it."
        actions={<Button onClick={startCreate}>Add prompt</Button>}
      />

      <DataState
        status={store.status}
        error={store.error}
        isEmpty={store.items.length === 0}
        emptyMessage="No prompts yet."
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead>Max tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.items.map((prompt) => (
                <TableRow key={prompt.id}>
                  <TableCell>
                    <div className={styles.stack}>
                      <span>{prompt.name}</span>
                      <span className={styles.subtle}>
                        {prompt.systemPrompt}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={styles.mono}>{prompt.model}</TableCell>
                  <TableCell>{prompt.temperature ?? "—"}</TableCell>
                  <TableCell>{prompt.maxTokens ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={prompt.isActive ? "default" : "outline"}>
                      {prompt.isActive ? "active" : "paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(prompt)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void store.remove(prompt.id)}
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
        wide
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit prompt" : "Add prompt"}
        pending={store.saving}
        error={store.error}
        onSubmit={() => void submit()}
      >
        <DialogColumns>
          <DialogColumn>
            <Field label="Name" htmlFor="promptName">
              <Input
                id="promptName"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>

            <Field
              grow
              label="System prompt"
              htmlFor="systemPrompt"
              hint="Standing instructions: voice, length, what to avoid. The guard against instructions hidden in fetched content is appended automatically."
            >
              <Textarea
                id="systemPrompt"
                className={promptStyles.promptArea}
                value={draft.systemPrompt}
                onChange={(event) =>
                  setDraft({ ...draft, systemPrompt: event.target.value })
                }
              />
            </Field>

            {/* Kept in the shorter column so it stays above the fold — a pause
                switch nobody can see is worse than no switch at all. */}
            <div className={styles.checkboxRow}>
              <Switch
                id="promptActive"
                checked={draft.isActive}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, isActive: checked })
                }
              />
              <label htmlFor="promptActive">Active</label>
            </div>
          </DialogColumn>

          <DialogColumn>
            <Field
              label="Model"
              hint={
                settings.modelsStatus === "error"
                  ? "Model list unavailable — set OPENROUTER_API_KEY to browse it. You can still type a slug."
                  : selectedModel
                    ? `$${selectedModel.promptUsdPerMillion.toFixed(2)} in · $${selectedModel.completionUsdPerMillion.toFixed(2)} out per million tokens`
                    : "Prices are per million tokens."
              }
            >
              {settings.models.length > 0 ? (
                <Select
                  value={draft.model}
                  // The trigger keeps to the name — a control is one line, and
                  // the full "name · price in · price out" would be truncated.
                  // The selected model's price sits in the hint underneath.
                  items={Object.fromEntries(
                    settings.models.map((model) => [model.id, model.name])
                  )}
                  onValueChange={(value) =>
                    setDraft({ ...draft, model: String(value) })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a model" />
                  </SelectTrigger>
                  <SelectContent className={promptStyles.modelPopup}>
                    {settings.models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className={promptStyles.modelItem}
                      >
                        <span className={promptStyles.modelText}>
                          <span className={promptStyles.modelName}>
                            {model.name}
                          </span>
                          <span className={promptStyles.modelPrice}>
                            ${model.promptUsdPerMillion.toFixed(2)} in · $
                            {model.completionUsdPerMillion.toFixed(2)} out
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={draft.model}
                  placeholder="anthropic/claude-sonnet-4.5"
                  onChange={(event) =>
                    setDraft({ ...draft, model: event.target.value })
                  }
                />
              )}
            </Field>

            <Field
              label="Temperature"
              htmlFor="temperature"
              hint="Lower is more predictable. 0.7 is a reasonable default for posts."
            >
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={draft.temperature}
                onChange={(event) =>
                  setDraft({ ...draft, temperature: event.target.value })
                }
              />
            </Field>

            <Field
              label="Max tokens"
              htmlFor="maxTokens"
              hint="Upper bound on the reply. A Telegram post fits in well under 700."
            >
              <Input
                id="maxTokens"
                type="number"
                min={1}
                value={draft.maxTokens}
                onChange={(event) =>
                  setDraft({ ...draft, maxTokens: event.target.value })
                }
              />
            </Field>

            <Field
              label="User template"
              htmlFor="userTemplate"
              hint="Sent to the model as the user message, once per collected item."
            >
              {/* Above the field, not below: this is the part that explains
                  what the field is for, so it has to be read first. */}
              <div className={promptStyles.placeholders}>
                {PLACEHOLDERS.map((entry) => (
                  <button
                    key={entry.token}
                    type="button"
                    className={promptStyles.placeholder}
                    title={`Insert — ${entry.meaning}`}
                    onClick={() => insertPlaceholder(entry.token)}
                  >
                    {entry.token}
                  </button>
                ))}
              </div>
              <Textarea
                id="userTemplate"
                ref={templateRef}
                className={promptStyles.templateArea}
                value={draft.userTemplate}
                onChange={(event) =>
                  setDraft({ ...draft, userTemplate: event.target.value })
                }
              />
            </Field>
          </DialogColumn>
        </DialogColumns>
      </FormDialog>
    </>
  )
}
