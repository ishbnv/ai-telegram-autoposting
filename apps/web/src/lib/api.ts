import type {
  ApiError,
  ChannelDto,
  CreateChannelInput,
  CreatePipelineInput,
  CreatePromptInput,
  CreateProxyInput,
  CreateSourceInput,
  DashboardSummary,
  ModelDto,
  NewsItemDto,
  NewsQuery,
  Paginated,
  PipelineDto,
  PostDto,
  PostsQuery,
  PromptDto,
  ProxyDto,
  PublicationDto,
  SessionDto,
  SettingsDto,
  SourceDto,
  UpdateChannelInput,
  UpdatePipelineInput,
  UpdatePromptInput,
  UpdateProxyInput,
  UpdateSourceInput,
} from "@contracts"

const BASE = "/api"

export class ApiRequestError extends Error {
  readonly status: number
  readonly fields: { path: string; message: string }[]

  constructor(
    status: number,
    message: string,
    fields: { path: string; message: string }[] = []
  ) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.fields = fields
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null

    throw new ApiRequestError(
      response.status,
      body?.error?.message ?? `Request failed with status ${response.status}`,
      body?.error?.fields ?? []
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value))
    }
  }

  const rendered = search.toString()
  return rendered ? `?${rendered}` : ""
}

/**
 * A hand-written client rather than Hono's RPC helper. `hc<AppType>` would give
 * inferred route types, but it pulls the server's whole type graph — Prisma's
 * generated client, the scraping stack — into the browser project's type check.
 * The DTOs in `@contracts` are the contract; this file is the only place route
 * strings live.
 */
export const apiClient = {
  auth: {
    login: (password: string) =>
      request<SessionDto>("/auth/login", {
        method: "POST",
        ...json({ password }),
      }),
    logout: () => request<SessionDto>("/auth/logout", { method: "POST" }),
    me: () => request<SessionDto>("/auth/me"),
  },

  dashboard: {
    summary: () => request<DashboardSummary>("/dashboard/summary"),
  },

  settings: {
    get: () => request<SettingsDto>("/settings"),
  },

  models: {
    list: () => request<ModelDto[]>("/models"),
  },

  channels: {
    list: () => request<ChannelDto[]>("/channels"),
    create: (input: CreateChannelInput) =>
      request<ChannelDto>("/channels", { method: "POST", ...json(input) }),
    update: (id: string, input: UpdateChannelInput) =>
      request<ChannelDto>(`/channels/${id}`, {
        method: "PATCH",
        ...json(input),
      }),
    remove: (id: string) =>
      request<void>(`/channels/${id}`, { method: "DELETE" }),
  },

  sources: {
    list: () => request<SourceDto[]>("/sources"),
    create: (input: CreateSourceInput) =>
      request<SourceDto>("/sources", { method: "POST", ...json(input) }),
    update: (id: string, input: UpdateSourceInput) =>
      request<SourceDto>(`/sources/${id}`, {
        method: "PATCH",
        ...json(input),
      }),
    remove: (id: string) =>
      request<void>(`/sources/${id}`, { method: "DELETE" }),
  },

  prompts: {
    list: () => request<PromptDto[]>("/prompts"),
    create: (input: CreatePromptInput) =>
      request<PromptDto>("/prompts", { method: "POST", ...json(input) }),
    update: (id: string, input: UpdatePromptInput) =>
      request<PromptDto>(`/prompts/${id}`, {
        method: "PATCH",
        ...json(input),
      }),
    remove: (id: string) =>
      request<void>(`/prompts/${id}`, { method: "DELETE" }),
  },

  pipelines: {
    list: () => request<PipelineDto[]>("/pipelines"),
    create: (input: CreatePipelineInput) =>
      request<PipelineDto>("/pipelines", { method: "POST", ...json(input) }),
    update: (id: string, input: UpdatePipelineInput) =>
      request<PipelineDto>(`/pipelines/${id}`, {
        method: "PATCH",
        ...json(input),
      }),
    remove: (id: string) =>
      request<void>(`/pipelines/${id}`, { method: "DELETE" }),
    run: (id: string) =>
      request<{ queued: boolean }>(`/pipelines/${id}/run`, { method: "POST" }),
  },

  proxies: {
    list: () => request<ProxyDto[]>("/proxies"),
    create: (input: CreateProxyInput) =>
      request<ProxyDto>("/proxies", { method: "POST", ...json(input) }),
    update: (id: string, input: UpdateProxyInput) =>
      request<ProxyDto>(`/proxies/${id}`, { method: "PATCH", ...json(input) }),
    remove: (id: string) =>
      request<void>(`/proxies/${id}`, { method: "DELETE" }),
  },

  news: {
    list: (params: Partial<NewsQuery> = {}) =>
      request<Paginated<NewsItemDto>>(`/news${query(params)}`),
  },

  posts: {
    list: (params: Partial<PostsQuery> = {}) =>
      request<Paginated<PostDto>>(`/posts${query(params)}`),
    publications: (params: { page?: number; pageSize?: number } = {}) =>
      request<Paginated<PublicationDto>>(`/posts/publications${query(params)}`),
    updateText: (id: string, text: string) =>
      request<PostDto>(`/posts/${id}`, { method: "PATCH", ...json({ text }) }),
    approve: (id: string) =>
      request<PostDto>(`/posts/${id}/approve`, { method: "POST" }),
    reject: (id: string) =>
      request<PostDto>(`/posts/${id}/reject`, { method: "POST" }),
    regenerate: (id: string) =>
      request<PostDto>(`/posts/${id}/regenerate`, { method: "POST" }),
  },
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const detail = error.fields
      .map((field) => `${field.path}: ${field.message}`)
      .join(", ")

    return detail ? `${error.message} (${detail})` : error.message
  }

  return error instanceof Error ? error.message : "Something went wrong"
}
