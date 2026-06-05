import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchEvalResults, triggerEvalRun } from '@/lib/api'

export function useEvals(sourceId: string) {
  const queryClient = useQueryClient()

  const results = useQuery({
    queryKey: ['evals', sourceId],
    queryFn: () => fetchEvalResults(sourceId),
    enabled: !!sourceId,
  })

  const runEvals = useMutation({
    mutationFn: ({ source_type }: { source_type: string }) =>
      triggerEvalRun(sourceId, source_type),
    onSuccess: () => {
      // Wait a few seconds then refresh results
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['evals', sourceId] }), 5000)
    },
  })

  return { results, runEvals }
}
