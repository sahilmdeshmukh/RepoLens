import { useState } from 'react'
import { Code2, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSources } from '@/hooks/useSources'
import { useIngest } from '@/hooks/useIngest'
import type { Source } from '@/types'

interface SidebarProps {
  activeSourceId: string | null
  onSelectSource: (source: Source) => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export function Sidebar({ activeSourceId, onSelectSource }: SidebarProps) {
  const [url, setUrl] = useState('')
  const [sourceType, setSourceType] = useState<'github' | 'api_docs'>('github')
  const { data: sources = [], isLoading } = useSources()
  const ingest = useIngest()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    ingest.mutate({ url: url.trim(), source_type: sourceType })
    setUrl('')
  }

  return (
    <div className="w-72 border-r flex flex-col h-screen" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
      <div className="p-4 font-bold text-lg border-b" style={{ borderColor: 'var(--border)' }}>
        RepoLens
      </div>

      <div className="p-4 space-y-3">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceType('github')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-sm transition-colors ${
                sourceType === 'github'
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground'
              }`}
              style={{ borderColor: 'var(--border)' }}
            >
              <Code2 size={14} /> GitHub
            </button>
            <button
              type="button"
              onClick={() => setSourceType('api_docs')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-sm transition-colors ${
                sourceType === 'api_docs'
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground'
              }`}
              style={{ borderColor: 'var(--border)' }}
            >
              <Globe size={14} /> API Docs
            </button>
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={sourceType === 'github' ? 'https://github.com/owner/repo' : 'https://docs.example.com'}
          />
          <Button type="submit" className="w-full" disabled={ingest.isPending}>
            {ingest.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Index'}
          </Button>
        </form>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1">
        {isLoading && <p className="text-sm px-2" style={{ color: 'var(--muted-foreground)' }}>Loading...</p>}
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => source.status === 'complete' && onSelectSource(source)}
            disabled={source.status !== 'complete'}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              activeSourceId === source.id ? 'bg-muted' : 'hover:bg-muted/50'
            } ${source.status !== 'complete' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{source.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[source.status]}`}>
                {source.status === 'processing' && <Loader2 className="inline animate-spin mr-0.5" size={10} />}
                {source.status}
              </span>
            </div>
            {source.chunk_count > 0 && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{source.chunk_count} chunks</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
