import { apiClient } from "@/lib/api"
import { createCollectionStore } from "@/store/collection"

export const useChannels = createCollectionStore(apiClient.channels)
export const useSources = createCollectionStore(apiClient.sources)
export const usePrompts = createCollectionStore(apiClient.prompts)
export const usePipelines = createCollectionStore(apiClient.pipelines)
export const useProxies = createCollectionStore(apiClient.proxies)
