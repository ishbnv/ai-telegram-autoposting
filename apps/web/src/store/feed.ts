import type {
  NewsItemDto,
  Paginated,
  PostDto,
  PostStatusValue,
  PublicationDto,
} from "@contracts"
import { create } from "zustand"

import { apiClient, errorMessage } from "@/lib/api"
import type { AsyncStatus } from "@/store/collection"

const PAGE_SIZE = 25

const emptyPage = <T>(): Paginated<T> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
})

type FeedState = {
  tab: "news" | "posts" | "publications"
  search: string
  sourceId: string | undefined
  postStatus: PostStatusValue | undefined
  page: number

  news: Paginated<NewsItemDto>
  posts: Paginated<PostDto>
  publications: Paginated<PublicationDto>

  status: AsyncStatus
  error: string | null
  /** Id of the post whose moderation action is in flight. */
  acting: string | null

  setTab: (tab: FeedState["tab"]) => void
  setSearch: (search: string) => void
  setSourceId: (sourceId: string | undefined) => void
  setPostStatus: (status: PostStatusValue | undefined) => void
  setPage: (page: number) => void
  load: () => Promise<void>
  act: (
    id: string,
    action: "approve" | "reject" | "regenerate"
  ) => Promise<void>
}

export const useFeed = create<FeedState>()((set, get) => ({
  tab: "news",
  search: "",
  sourceId: undefined,
  postStatus: undefined,
  page: 1,

  news: emptyPage<NewsItemDto>(),
  posts: emptyPage<PostDto>(),
  publications: emptyPage<PublicationDto>(),

  status: "idle",
  error: null,
  acting: null,

  // Any filter change resets paging: staying on page 7 of a narrower result set
  // shows an empty table for no obvious reason.
  setTab: (tab) => {
    set({ tab, page: 1 })
    void get().load()
  },
  setSearch: (search) => {
    set({ search, page: 1 })
    void get().load()
  },
  setSourceId: (sourceId) => {
    set({ sourceId, page: 1 })
    void get().load()
  },
  setPostStatus: (postStatus) => {
    set({ postStatus, page: 1 })
    void get().load()
  },
  setPage: (page) => {
    set({ page })
    void get().load()
  },

  load: async () => {
    const { tab, search, sourceId, postStatus, page } = get()
    set({ status: "loading", error: null })

    try {
      if (tab === "news") {
        set({
          news: await apiClient.news.list({
            page,
            pageSize: PAGE_SIZE,
            search: search || undefined,
            sourceId,
          }),
        })
      } else if (tab === "posts") {
        set({
          posts: await apiClient.posts.list({
            page,
            pageSize: PAGE_SIZE,
            search: search || undefined,
            status: postStatus,
          }),
        })
      } else {
        set({
          publications: await apiClient.posts.publications({
            page,
            pageSize: PAGE_SIZE,
          }),
        })
      }

      set({ status: "ready" })
    } catch (error) {
      set({ status: "error", error: errorMessage(error) })
    }
  },

  act: async (id, action) => {
    set({ acting: id, error: null })
    try {
      await apiClient.posts[action](id)
      await get().load()
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ acting: null })
    }
  },
}))
