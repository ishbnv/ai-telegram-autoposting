import { create } from "zustand"

import { errorMessage } from "@/lib/api"

export type AsyncStatus = "idle" | "loading" | "ready" | "error"

export type CollectionState<T, CreateInput, UpdateInput> = {
  items: T[]
  status: AsyncStatus
  error: string | null
  /** Set while a create/update/delete is in flight, to disable submit buttons. */
  saving: boolean
  load: () => Promise<void>
  create: (input: CreateInput) => Promise<void>
  update: (id: string, input: UpdateInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

type Resource<T, CreateInput, UpdateInput> = {
  list: () => Promise<T[]>
  create: (input: CreateInput) => Promise<T>
  update: (id: string, input: UpdateInput) => Promise<T>
  remove: (id: string) => Promise<void>
}

/**
 * Channels, sources, prompts, pipelines and proxies are all the same shape:
 * load a list, then create, edit and delete rows. One factory rather than five
 * near-identical slices.
 *
 * Mutations refetch instead of patching local state — the server fills in
 * defaults and timestamps, and a stale row is worse than one extra request.
 */
export function createCollectionStore<
  T extends { id: string },
  CreateInput,
  UpdateInput,
>(resource: Resource<T, CreateInput, UpdateInput>) {
  return create<CollectionState<T, CreateInput, UpdateInput>>()((set, get) => {
    async function mutate(action: () => Promise<unknown>) {
      set({ saving: true, error: null })
      try {
        await action()
        await get().load()
      } catch (error) {
        set({ error: errorMessage(error) })
        throw error
      } finally {
        set({ saving: false })
      }
    }

    return {
      items: [],
      status: "idle",
      error: null,
      saving: false,

      load: async () => {
        set({ status: get().status === "ready" ? "ready" : "loading" })
        try {
          set({ items: await resource.list(), status: "ready", error: null })
        } catch (error) {
          set({ status: "error", error: errorMessage(error) })
        }
      },

      create: (input) => mutate(() => resource.create(input)),
      update: (id, input) => mutate(() => resource.update(id, input)),
      remove: (id) => mutate(() => resource.remove(id)),
    }
  })
}
