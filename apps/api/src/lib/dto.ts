import type {
  ChannelDto,
  NewsItemDto,
  PipelineDto,
  PipelineFilters,
  PostDto,
  PromptDto,
  ProxyDto,
  PublicationDto,
  SourceDto,
} from "@contracts"
import type {
  Channel,
  NewsItem,
  Pipeline,
  Post,
  Prompt,
  Proxy,
  Publication,
  Source,
} from "@db"

/**
 * Prisma rows never leave the process as-is: BigInt and Decimal do not survive
 * JSON.stringify, and the database shape is not the API's contract.
 */

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function isoRequired(value: Date): string {
  return value.toISOString()
}

/** Prisma Decimal exposes toString; Number is enough for display amounts. */
function decimal(value: { toString(): string } | null | undefined): number {
  return value ? Number(value.toString()) : 0
}

export function toChannelDto(channel: Channel): ChannelDto {
  return {
    id: channel.id,
    title: channel.title,
    tgChatId: channel.tgChatId.toString(),
    username: channel.username,
    moderationChatId: channel.moderationChatId.toString(),
    footerTemplate: channel.footerTemplate,
    isActive: channel.isActive,
    createdAt: isoRequired(channel.createdAt),
    updatedAt: isoRequired(channel.updatedAt),
  }
}

export function toSourceDto(source: Source): SourceDto {
  return {
    id: source.id,
    type: source.type,
    name: source.name,
    url: source.url,
    config: (source.config ?? {}) as Record<string, unknown>,
    isActive: source.isActive,
    fetchIntervalSec: source.fetchIntervalSec,
    lastFetchedAt: iso(source.lastFetchedAt),
    lastError: source.lastError,
    proxyId: source.proxyId,
    createdAt: isoRequired(source.createdAt),
    updatedAt: isoRequired(source.updatedAt),
  }
}

export function toPromptDto(prompt: Prompt): PromptDto {
  return {
    id: prompt.id,
    name: prompt.name,
    systemPrompt: prompt.systemPrompt,
    userTemplate: prompt.userTemplate,
    model: prompt.model,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
    isActive: prompt.isActive,
    createdAt: isoRequired(prompt.createdAt),
    updatedAt: isoRequired(prompt.updatedAt),
  }
}

export function toPipelineDto(
  pipeline: Pipeline & { sources: { sourceId: string }[] }
): PipelineDto {
  const filters = (pipeline.filters ?? {}) as Partial<PipelineFilters>

  return {
    id: pipeline.id,
    name: pipeline.name,
    promptId: pipeline.promptId,
    channelId: pipeline.channelId,
    sourceIds: pipeline.sources.map((link) => link.sourceId),
    isActive: pipeline.isActive,
    filters: {
      include: filters.include ?? [],
      exclude: filters.exclude ?? [],
    },
    cron: pipeline.cron,
    maxPostsPerDay: pipeline.maxPostsPerDay,
    freshnessWindowHours: pipeline.freshnessWindowHours,
    lastRunAt: iso(pipeline.lastRunAt),
    createdAt: isoRequired(pipeline.createdAt),
    updatedAt: isoRequired(pipeline.updatedAt),
  }
}

/**
 * Strips credentials out of a proxy URL. The stored value is what the fetcher
 * needs; what the panel gets back must not be a working proxy.
 */
export function maskProxyUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "***" : ""
      parsed.password = parsed.password ? "***" : ""
    }
    return parsed.toString()
  } catch {
    return "***"
  }
}

export function toProxyDto(proxy: Proxy): ProxyDto {
  return {
    id: proxy.id,
    label: proxy.label,
    url: maskProxyUrl(proxy.url),
    usedFor: proxy.usedFor,
    isActive: proxy.isActive,
    createdAt: isoRequired(proxy.createdAt),
    updatedAt: isoRequired(proxy.updatedAt),
  }
}

export function toNewsItemDto(
  item: NewsItem & { source: { name: string } }
): NewsItemDto {
  return {
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.source.name,
    title: item.title,
    url: item.url,
    summary: item.summary,
    imageUrl: item.imageUrl,
    author: item.author,
    publishedAt: iso(item.publishedAt),
    fetchedAt: isoRequired(item.fetchedAt),
    status: item.status,
  }
}

export function toPostDto(
  post: Post & {
    pipeline: { name: string }
    channel: { title: string }
    llmCalls: { costUsd: { toString(): string } }[]
  }
): PostDto {
  return {
    id: post.id,
    pipelineId: post.pipelineId,
    pipelineName: post.pipeline.name,
    newsItemId: post.newsItemId,
    channelId: post.channelId,
    channelTitle: post.channel.title,
    promptId: post.promptId,
    model: post.model,
    status: post.status,
    text: post.text,
    mediaUrl: post.mediaUrl,
    sourceName: post.sourceName,
    sourceUrl: post.sourceUrl,
    moderationMessageId: post.moderationMessageId,
    publishedAt: iso(post.publishedAt),
    scheduledFor: iso(post.scheduledFor),
    error: post.error,
    costUsd: post.llmCalls.reduce(
      (sum, call) => sum + decimal(call.costUsd),
      0
    ),
    createdAt: isoRequired(post.createdAt),
    updatedAt: isoRequired(post.updatedAt),
  }
}

export function toPublicationDto(
  publication: Publication & {
    channel: { title: string }
    post: { text: string; sourceName: string; sourceUrl: string }
  }
): PublicationDto {
  return {
    id: publication.id,
    postId: publication.postId,
    channelId: publication.channelId,
    channelTitle: publication.channel.title,
    tgMessageId: publication.tgMessageId,
    publishedAt: isoRequired(publication.publishedAt),
    text: publication.post.text,
    sourceName: publication.post.sourceName,
    sourceUrl: publication.post.sourceUrl,
  }
}
