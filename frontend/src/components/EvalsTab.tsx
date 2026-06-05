import { Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEvals } from '@/hooks/useEvals'
import type { Source, EvalResult } from '@/types'

interface EvalsTabProps {
  source: Source
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--muted-foreground)' }}>—</span>
  const color = value >= 4 ? '#16a34a' : value >= 3 ? '#ca8a04' : '#dc2626'
  return <span className="font-semibold" style={{ color }}>{value.toFixed(1)}</span>
}

export function EvalsTab({ source }: EvalsTabProps) {
  const { results, runEvals } = useEvals(source.id)
  const data = results.data

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div>
          <p className="font-semibold">Evals — {source.name}</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Retrieval quality + answer faithfulness
          </p>
        </div>
        <Button
          onClick={() => runEvals.mutate({ source_type: source.source_type })}
          disabled={runEvals.isPending}
          size="sm"
        >
          {runEvals.isPending ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
          <span className="ml-1">Run Evals</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {data?.summary && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Retrieval F1', value: data.summary.avg_token_overlap_f1.toFixed(2) },
              { label: 'Avg Faithfulness', value: data.summary.avg_faithfulness.toFixed(1) },
              { label: 'Avg Relevance', value: data.summary.avg_relevance.toFixed(1) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-4 text-center" style={{ background: 'var(--muted)' }}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {data?.results?.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                <th className="pb-2 w-[40%]">Question</th>
                <th className="pb-2">F1</th>
                <th className="pb-2">Faith.</th>
                <th className="pb-2">Rel.</th>
                <th className="pb-2">Reasoning</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r: EvalResult) => (
                <tr key={r.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-2 pr-4">{r.question}</td>
                  <td className="py-2"><ScoreBadge value={r.token_overlap_f1} /></td>
                  <td className="py-2"><ScoreBadge value={r.faithfulness} /></td>
                  <td className="py-2"><ScoreBadge value={r.relevance} /></td>
                  <td className="py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.judge_reasoning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-center mt-8" style={{ color: 'var(--muted-foreground)' }}>
            No eval results yet. Click "Run Evals" to start.
          </p>
        )}
      </div>
    </div>
  )
}
