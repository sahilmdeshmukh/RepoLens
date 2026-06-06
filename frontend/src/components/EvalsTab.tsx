import { Play, Loader2, TrendingUp } from 'lucide-react'
import { useEvals } from '@/hooks/useEvals'
import type { Source, EvalResult } from '@/types'

interface EvalsTabProps {
  source: Source
}

function ScoreBadge({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span style={{ color: '#777' }}>—</span>
  const pct = value / max
  const color = pct >= 0.8 ? '#34d399' : pct >= 0.6 ? '#fbbf24' : '#f87171'
  return <span className="font-mono text-sm font-semibold" style={{ color }}>{value.toFixed(1)}</span>
}

function MetricCard({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm font-medium mt-1" style={{ color: '#aaa' }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: '#555' }}>{desc}</p>
    </div>
  )
}

export function EvalsTab({ source }: EvalsTabProps) {
  const { results, runEvals } = useEvals(source.id)
  const data = results.data

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1a1a1a' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1a1a1a' }}>
            <TrendingUp size={15} style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Quality Evals</p>
            <p className="text-xs" style={{ color: '#999' }}>Retrieval F1 + LLM-as-judge scoring</p>
          </div>
        </div>
        <button
          onClick={() => runEvals.mutate({ source_type: source.source_type })}
          disabled={runEvals.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          style={{ background: '#6366f1', color: 'white', opacity: runEvals.isPending ? 0.6 : 1 }}
        >
          {runEvals.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Run Evals
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Summary cards */}
        {data?.summary && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <MetricCard
              label="Retrieval F1"
              value={data.summary.avg_token_overlap_f1.toFixed(2)}
              desc="Token overlap with expected answers"
            />
            <MetricCard
              label="Faithfulness"
              value={`${data.summary.avg_faithfulness.toFixed(1)} / 5`}
              desc="Grounded in retrieved context"
            />
            <MetricCard
              label="Relevance"
              value={`${data.summary.avg_relevance.toFixed(1)} / 5`}
              desc="Actually addresses the question"
            />
          </div>
        )}

        {/* Results table */}
        {data?.results?.length > 0 ? (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#111' }}>
                  {['Question', 'F1', 'Faith.', 'Rel.', 'Reasoning'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: '#555', borderBottom: '1px solid #1e1e1e' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.results.map((r: EvalResult, i: number) => (
                  <tr key={r.id} style={{ borderBottom: i < data.results.length - 1 ? '1px solid #141414' : 'none' }}>
                    <td className="px-4 py-3 text-sm" style={{ color: '#ccc' }}>{r.question}</td>
                    <td className="px-4 py-3"><ScoreBadge value={r.token_overlap_f1} max={1} /></td>
                    <td className="px-4 py-3"><ScoreBadge value={r.faithfulness} /></td>
                    <td className="px-4 py-3"><ScoreBadge value={r.relevance} /></td>
                    <td className="px-4 py-3 text-xs max-w-xs" style={{ color: '#666' }}>{r.judge_reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#111' }}>
              <TrendingUp size={18} style={{ color: '#777' }} />
            </div>
            <p className="text-sm" style={{ color: '#aaa' }}>No eval results yet</p>
            <p className="text-xs" style={{ color: '#888' }}>Click "Run Evals" to measure quality</p>
          </div>
        )}
      </div>
    </div>
  )
}
