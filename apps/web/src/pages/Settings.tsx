import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui"
import { useEffect } from "react"

import { PageHeader } from "@/components/PageHeader"
import { useSettings } from "@/store/settings"

import styles from "./Settings.module.scss"

export function SettingsPage() {
  const { settings, load } = useSettings()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader
        title="Settings"
        description="Read-only. Secrets live in the environment, not in the database."
      />

      <Alert className={styles.notice}>
        <AlertTitle>Configuration comes from the environment</AlertTitle>
        <AlertDescription>
          This repository is public, so tokens and API keys are never stored or
          displayed. Change them in <code>.env</code> and restart the processes.
        </AlertDescription>
      </Alert>

      <div className={styles.grid}>
        <Card>
          <CardHeader>
            <CardTitle>Telegram</CardTitle>
            <CardDescription>TELEGRAM_BOT_TOKEN</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            <Badge
              variant={
                settings?.telegramBotConfigured ? "default" : "destructive"
              }
            >
              {settings?.telegramBotConfigured ? "configured" : "missing"}
            </Badge>
            <div className={styles.row}>
              <span className={styles.label}>Default moderation chat</span>
              <span className={styles.mono}>
                {settings?.defaultModerationChatId ?? "not set"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OpenRouter</CardTitle>
            <CardDescription>OPENROUTER_API_KEY</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            <Badge
              variant={
                settings?.openRouterConfigured ? "default" : "destructive"
              }
            >
              {settings?.openRouterConfigured ? "configured" : "missing"}
            </Badge>
            <p className={styles.label}>
              Needed to browse models and to generate posts.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timezone</CardTitle>
            <CardDescription>Used for daily counters</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            <span className={styles.mono}>{settings?.timezone ?? "—"}</span>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
