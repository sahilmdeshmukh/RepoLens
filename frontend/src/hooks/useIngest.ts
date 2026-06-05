import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ingestSource } from '@/lib/api'

export function useIngest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ url, source_type }: { url: string; source_type: 'github' | 'api_docs' }) =>
      ingestSource(url, source_type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}
