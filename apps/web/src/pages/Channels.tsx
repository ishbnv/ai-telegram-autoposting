import { DEFAULT_FOOTER_TEMPLATE, type ChannelDto } from "@contracts"
import {
  Badge,
  Button,
  Input,
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
import { useChannels } from "@/store/resources"

import styles from "./Resource.module.scss"

type Draft = {
  title: string
  tgChatId: string
  username: string
  moderationChatId: string
  footerTemplate: string
  isActive: boolean
}

const emptyDraft: Draft = {
  title: "",
  tgChatId: "",
  username: "",
  moderationChatId: "",
  footerTemplate: DEFAULT_FOOTER_TEMPLATE,
  isActive: true,
}

export function ChannelsPage() {
  const store = useChannels()
  const [editing, setEditing] = useState<ChannelDto | null>(null)
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

  function startEdit(channel: ChannelDto) {
    setEditing(channel)
    setDraft({
      title: channel.title,
      tgChatId: channel.tgChatId,
      username: channel.username ?? "",
      moderationChatId: channel.moderationChatId,
      footerTemplate: channel.footerTemplate,
      isActive: channel.isActive,
    })
    setOpen(true)
  }

  async function submit() {
    const payload = {
      title: draft.title,
      tgChatId: draft.tgChatId,
      username: draft.username || null,
      moderationChatId: draft.moderationChatId,
      footerTemplate: draft.footerTemplate,
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
      // The store already holds the message; the dialog renders it.
    }
  }

  return (
    <>
      <PageHeader
        title="Channels"
        description="Where posts go, and which chat approves them."
        actions={<Button onClick={startCreate}>Add channel</Button>}
      />

      <DataState
        status={store.status}
        error={store.error}
        isEmpty={store.items.length === 0}
        emptyMessage="No channels yet. Add the one your bot administrates."
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Chat id</TableHead>
                <TableHead>Moderation chat</TableHead>
                <TableHead>Footer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.items.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>
                    <div className={styles.stack}>
                      <span>{channel.title}</span>
                      {channel.username ? (
                        <span className={styles.subtle}>
                          @{channel.username}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={styles.mono}>
                    {channel.tgChatId}
                  </TableCell>
                  <TableCell className={styles.mono}>
                    {channel.moderationChatId}
                  </TableCell>
                  <TableCell className={styles.subtle}>
                    {channel.footerTemplate}
                  </TableCell>
                  <TableCell>
                    <Badge variant={channel.isActive ? "default" : "outline"}>
                      {channel.isActive ? "active" : "paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(channel)}
                      >
                        Edit
                      </Button>
                      <ConfirmButton
                        size="xs"
                        variant="ghost"
                        confirmLabel="Delete channel?"
                        onConfirm={() => void store.remove(channel.id)}
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
        title={editing ? "Edit channel" : "Add channel"}
        description="The bot must be an administrator of the channel and a member of the moderation chat."
        pending={store.saving}
        error={store.error}
        onSubmit={() => void submit()}
      >
        <Field label="Title" htmlFor="title">
          <Input
            id="title"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>

        <Field
          label="Channel chat id"
          htmlFor="tgChatId"
          hint="Looks like -1001234567890. Forward a channel post to @userinfobot to find it."
        >
          <Input
            id="tgChatId"
            value={draft.tgChatId}
            onChange={(event) =>
              setDraft({ ...draft, tgChatId: event.target.value })
            }
          />
        </Field>

        <Field
          label="Username"
          htmlFor="username"
          hint="Optional, without the @."
        >
          <Input
            id="username"
            value={draft.username}
            onChange={(event) =>
              setDraft({ ...draft, username: event.target.value })
            }
          />
        </Field>

        <Field
          label="Moderation chat id"
          htmlFor="moderationChatId"
          hint="Drafts are sent here with approval buttons."
        >
          <Input
            id="moderationChatId"
            value={draft.moderationChatId}
            onChange={(event) =>
              setDraft({ ...draft, moderationChatId: event.target.value })
            }
          />
        </Field>

        <Field
          label="Source footer"
          htmlFor="footerTemplate"
          hint="Placeholders: {sourceLink} for a hyperlink, {sourceName} and {sourceUrl} for plain text."
        >
          <Input
            id="footerTemplate"
            value={draft.footerTemplate}
            onChange={(event) =>
              setDraft({ ...draft, footerTemplate: event.target.value })
            }
          />
        </Field>

        <div className={styles.checkboxRow}>
          <Switch
            id="isActive"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, isActive: checked })
            }
          />
          <label htmlFor="isActive">Active</label>
        </div>
      </FormDialog>
    </>
  )
}
