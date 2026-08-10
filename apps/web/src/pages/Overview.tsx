import type { PostStatusValue } from "@contracts"
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@ui"
import { ExternalLink } from "lucide-react"
import { useEffect } from "react"

import { DataState } from "@/components/DataState"
import { PageHeader } from "@/components/PageHeader"
import { useInterval } from "@/hooks/useInterval"
import { formatDateTime, formatDuration, formatUsd } from "@/lib/format"
import { useDashboard } from "@/store/dashboard"
import { useFeed } from "@/store/feed"
import { useSources } from "@/store/resources"

import styles from "./Overview.module.scss"

const REFRESH_MS = 30_000

const ALL = "__all__"

const POST_STATUSES: PostStatusValue[] = [
  "GENERATING",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "FAILED",
]

function prettyStatus(status: PostStatusValue): string {
  return status.replace("_", " ").toLowerCase()
}

function statusVariant(
  status: PostStatusValue
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PUBLISHED") return "default"
  if (status === "FAILED") return "destructive"
  if (status === "PENDING_APPROVAL") return "secondary"
  return "outline"
}

export function OverviewPage() {
  const dashboard = useDashboard()
  const feed = useFeed()
  const sources = useSources()

  useEffect(() => {
    void dashboard.load()
    void feed.load()
    void sources.load()
    // Mounting once is the point; the interval below handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useInterval(() => {
    void dashboard.load()
  }, REFRESH_MS)

  const summary = dashboard.summary

  return (
    <>
      <PageHeader
        title="Overview"
        description="Refreshes every 30 seconds."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void dashboard.load()
              void feed.load()
            }}
          >
            Refresh
          </Button>
        }
      />

      <div className={styles.processes}>
        {summary?.processes.length ? (
          summary.processes.map((process) => (
            <div
              key={`${process.process}:${process.instanceId}`}
              className={styles.process}
            >
              <span
                className={`${styles.dot} ${
                  process.healthy ? styles.dotHealthy : styles.dotStale
                }`}
              />
              <strong>{process.process.toLowerCase()}</strong>
              <span className={styles.processMeta}>
                {process.healthy
                  ? `beat ${formatDuration(process.silentForSec)} ago`
                  : `silent for ${formatDuration(process.silentForSec)}`}
              </span>
            </div>
          ))
        ) : (
          <div className={styles.process}>
            <span className={styles.dot} />
            <span className={styles.processMeta}>
              No process has reported in yet
            </span>
          </div>
        )}
      </div>

      <div className={styles.stats}>
        <Stat
          label="Published today"
          value={summary?.posts.publishedToday ?? 0}
          hint={`${summary?.posts.publishedThisWeek ?? 0} this week`}
        />
        <Stat
          label="Awaiting approval"
          value={summary?.posts.pendingApproval ?? 0}
          hint="waiting in Telegram"
        />
        <Stat
          label="Queued"
          value={summary?.posts.queued ?? 0}
          hint="approved, not sent yet"
        />
        <Stat
          label="LLM spend today"
          value={formatUsd(summary?.spend.todayUsd ?? 0)}
          hint={`${formatUsd(summary?.spend.weekUsd ?? 0)} this week`}
        />
        <Stat
          label="Sources"
          value={`${summary?.sources.active ?? 0} of ${summary?.sources.total ?? 0}`}
          hint={
            summary?.sources.failing
              ? `${summary.sources.failing} failing`
              : "all healthy"
          }
        />
      </div>

      <Tabs
        value={feed.tab}
        onValueChange={(value) => feed.setTab(value as typeof feed.tab)}
      >
        <TabsList>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="publications">Publications</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={styles.toolbar}>
        {feed.tab !== "publications" ? (
          <Input
            className={styles.search}
            placeholder="Search by title and text…"
            value={feed.search}
            onChange={(event) => feed.setSearch(event.target.value)}
          />
        ) : null}

        {feed.tab === "news" ? (
          <Select
            value={feed.sourceId ?? ALL}
            // Base UI renders the raw value in the trigger unless it is given a
            // value-to-label map.
            items={{
              [ALL]: "All sources",
              ...Object.fromEntries(
                sources.items.map((source) => [source.id, source.name])
              ),
            }}
            onValueChange={(value) =>
              feed.setSourceId(value === ALL ? undefined : String(value))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              {sources.items.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {feed.tab === "posts" ? (
          <Select
            value={feed.postStatus ?? ALL}
            items={{
              [ALL]: "Any status",
              ...Object.fromEntries(
                POST_STATUSES.map((status) => [status, prettyStatus(status)])
              ),
            }}
            onValueChange={(value) =>
              feed.setPostStatus(
                value === ALL ? undefined : (value as PostStatusValue)
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {POST_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {prettyStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {feed.tab === "news" ? <NewsTable /> : null}
      {feed.tab === "posts" ? <PostsTable /> : null}
      {feed.tab === "publications" ? <PublicationsTable /> : null}
    </>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  )
}

function Pager({
  total,
  page,
  pageSize,
}: {
  total: number
  page: number
  pageSize: number
}) {
  const setPage = useFeed((state) => state.setPage)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={styles.pager}>
      <span>
        {total} item{total === 1 ? "" : "s"} · page {page} of {lastPage}
      </span>
      <span className={styles.rowActions}>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </span>
    </div>
  )
}

function NewsTable() {
  const { news, status, error } = useFeed()

  return (
    <DataState
      status={status}
      error={error}
      isEmpty={news.items.length === 0}
      emptyMessage="Nothing collected yet. Add a source and run its pipeline."
    >
      <div className={styles.tableWrap}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Collected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className={styles.title}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5"
                    >
                      {item.title}
                      <ExternalLink size={12} />
                    </a>
                    {item.summary ? (
                      <span className={styles.subtle}>
                        {item.summary.slice(0, 140)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{item.sourceName}</TableCell>
                <TableCell>{formatDateTime(item.publishedAt)}</TableCell>
                <TableCell>{formatDateTime(item.fetchedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager total={news.total} page={news.page} pageSize={news.pageSize} />
    </DataState>
  )
}

function PostsTable() {
  const { posts, status, error, acting, act } = useFeed()

  return (
    <DataState
      status={status}
      error={error}
      isEmpty={posts.items.length === 0}
      emptyMessage="No drafts yet."
    >
      <div className={styles.tableWrap}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Text</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.items.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <div className={styles.title}>
                    <span>{post.text.slice(0, 120) || "—"}</span>
                    <a
                      href={post.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={styles.subtle}
                    >
                      {post.sourceName}
                    </a>
                    {post.error ? (
                      <span className="text-xs text-destructive">
                        {post.error.slice(0, 160)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(post.status)}>
                    {post.status.replace("_", " ").toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell>{post.channelTitle}</TableCell>
                <TableCell>{formatUsd(post.costUsd)}</TableCell>
                <TableCell>{formatDateTime(post.createdAt)}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    {post.status === "PENDING_APPROVAL" ? (
                      <>
                        <Button
                          size="xs"
                          disabled={acting === post.id}
                          onClick={() => void act(post.id, "approve")}
                        >
                          Publish
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={acting === post.id}
                          onClick={() => void act(post.id, "regenerate")}
                        >
                          Regenerate
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={acting === post.id}
                          onClick={() => void act(post.id, "reject")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {post.status === "FAILED" ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={acting === post.id}
                        onClick={() => void act(post.id, "regenerate")}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager total={posts.total} page={posts.page} pageSize={posts.pageSize} />
    </DataState>
  )
}

function PublicationsTable() {
  const { publications, status, error } = useFeed()

  return (
    <DataState
      status={status}
      error={error}
      isEmpty={publications.items.length === 0}
      emptyMessage="Nothing has been published yet."
    >
      <div className={styles.tableWrap}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Text</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {publications.items.map((publication) => (
              <TableRow key={publication.id}>
                <TableCell>{publication.text.slice(0, 140)}</TableCell>
                <TableCell>{publication.channelTitle}</TableCell>
                <TableCell>
                  <a
                    href={publication.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {publication.sourceName}
                  </a>
                </TableCell>
                <TableCell>{formatDateTime(publication.publishedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager
        total={publications.total}
        page={publications.page}
        pageSize={publications.pageSize}
      />
    </DataState>
  )
}
