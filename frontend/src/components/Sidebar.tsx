import { useState } from 'react'
import { Code2, Globe, Loader2, Plus, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react'
import { useSources } from '@/hooks/useSources'
import { useIngest } from '@/hooks/useIngest'
import type { Source } from '@/types'

interface SidebarProps {
  activeSourceId: string | null
  onSelectSource: (source: Source) => void
}

const STATUS = {
  complete:   { icon: CheckCircle2, color: '#22c55e', label: 'Ready' },
  processing: { icon: Loader2,       color: '#818cf8', label: 'Indexing' },
  pending:    { icon: Clock,          color: '#f59e0b', label: 'Pending' },
  failed:     { icon: XCircle,        color: '#ef4444', label: 'Failed'  },
}

export function Sidebar({ activeSourceId, onSelectSource }: SidebarProps) {
  const [url, setUrl] = useState('')
  const [sourceType, setSourceType] = useState<'github' | 'api_docs'>('github')
  const [showForm, setShowForm] = useState(false)
  const { data: sources = [], isLoading } = useSources()
  const ingest = useIngest()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    ingest.mutate({ url: url.trim(), source_type: sourceType })
    setUrl('')
    setShowForm(false)
  }

  return (
    <aside style={{
      width: 260, minWidth: 260, height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0d0d0d', borderRight: '1px solid #1c1c1c',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            boxShadow: '0 0 12px rgba(99,102,241,0.4)',
          }}>
            <Code2 size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#f0f0f0', letterSpacing: '-0.3px' }}>RepoLens</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>RAG for your code</div>
          </div>
        </div>
      </div>

      {/* Add source */}
      <div style={{ padding: '12px 12px 8px' }}>
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            color: '#666', background: 'transparent', border: '1px dashed #252525',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#818cf8' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#252525'; e.currentTarget.style.color = '#666' }}
          >
            <Plus size={14} />
            Add source
          </button>
        ) : (
          <div style={{ background: '#161616', borderRadius: 10, padding: 12, border: '1px solid #252525' }}>
            {/* Type tabs */}
            <div style={{ display: 'flex', background: '#0d0d0d', borderRadius: 7, padding: 3, marginBottom: 10 }}>
              {(['github', 'api_docs'] as const).map((t) => (
                <button key={t} onClick={() => setSourceType(t)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '5px 0', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: sourceType === t ? '#4f46e5' : 'transparent',
                  color: sourceType === t ? '#fff' : '#555',
                  border: 'none',
                }}>
                  {t === 'github' ? <Code2 size={11} /> : <Globe size={11} />}
                  {t === 'github' ? 'GitHub' : 'Docs'}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit}>
              <input
                autoFocus value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={sourceType === 'github' ? 'github.com/owner/repo' : 'docs.example.com'}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                  background: '#0d0d0d', color: '#d0d0d0', border: '1px solid #252525',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 8,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#4f46e5')}
                onBlur={e => (e.currentTarget.style.borderColor = '#252525')}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="submit" disabled={!url.trim() || ingest.isPending} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  cursor: url.trim() && !ingest.isPending ? 'pointer' : 'not-allowed',
                  background: '#4f46e5', color: '#fff', border: 'none',
                  opacity: !url.trim() || ingest.isPending ? 0.5 : 1,
                }}>
                  {ingest.isPending ? 'Indexing…' : 'Index'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setUrl('') }} style={{
                  padding: '7px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  background: '#1e1e1e', color: '#777', border: 'none',
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Section label */}
      {sources.length > 0 && (
        <div style={{ padding: '8px 16px 4px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#666', textTransform: 'uppercase' }}>
            Sources
          </span>
        </div>
      )}

      {/* Source list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', color: '#777', fontSize: 12 }}>
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && sources.length === 0 && (
          <div style={{ padding: '16px 8px', textAlign: 'center', color: '#999', fontSize: 12 }}>
            No sources yet
          </div>
        )}
        {sources.map((source: Source) => {
          const isActive = activeSourceId === source.id
          const canSelect = source.status === 'complete'
          const S = STATUS[source.status as keyof typeof STATUS] || STATUS.pending
          return (
            <button key={source.id} onClick={() => canSelect && onSelectSource(source)}
              disabled={!canSelect}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                cursor: canSelect ? 'pointer' : 'default', marginBottom: 2, border: 'none',
                background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                transition: 'background 0.12s',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(99,102,241,0.25)' : 'none',
              }}
              onMouseEnter={e => { if (!isActive && canSelect) e.currentTarget.style.background = '#161616' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <S.icon size={12} color={S.color}
                  className={source.status === 'processing' ? 'animate-spin' : ''} />
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: isActive ? '#a5b4fc' : '#c0c0c0',
                }}>
                  {source.name}
                </span>
                {isActive && <ChevronRight size={12} color="#6366f1" />}
              </div>
              {source.chunk_count > 0 && (
                <div style={{ fontSize: 11, color: '#777', marginTop: 2, paddingLeft: 20 }}>
                  {source.chunk_count.toLocaleString()} chunks
                </div>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
