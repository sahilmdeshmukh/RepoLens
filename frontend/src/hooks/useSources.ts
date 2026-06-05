import { useQuery } from '@tanstack/react-query'
import { fetchSources } from '@/lib/api'
import type { Source } from '@/types'

export function useSources() {
  return useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: fetchSources,
    // Poll every 3s when any source is still processing
    refetchInterval: (query) => {
      const sources = query.state.data || []
      const hasProcessing = sources.some(
        (s: Source) => s.status === 'pending' || s.status === 'processing'
      )
      return hasProcessing ? 3000 : false
    },
  })
}
