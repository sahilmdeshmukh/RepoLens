import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, FileCode, Sparkles, User } from 'lucide-react'
import type { Message, Citation } from '@/types'

function CitationChip({ c }: { c: Citation }) {
  const isCode = !!c.file_path
  return isCode ? (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, fontSize: 11, background: 'rgba(99,102,241,0.1)',
      border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8',
    }}>
      <FileCode size={10} />
      <span style={{ fontFamily: 'monospace' }}>{c.file_path?.split('/').pop()}</span>
      {c.start_line && <span style={{ opacity: 0.6 }}>:{c.start_line}</span>}
    </div>
  ) : (
    <a href={c.page_url} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, fontSize: 11, textDecoration: 'none',
      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399',
    }}>
      <ExternalLink size={10} />
      {c.section_title?.slice(0, 28) || 'Source'}
    </a>
  )
}

export function MessageBubble({ message }: { message: Message }) {
  const [showCitations, setShowCitations] = useState(false)
  const isUser = message.role === 'user'

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? '#1e1e1e' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        boxShadow: isUser ? 'none' : '0 0 12px rgba(99,102,241,0.2)',
      }}>
        {isUser ? <User size={14} color="#666" /> : <Sparkles size={14} color="#fff" />}
      </div>

      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* Bubble */}
        <div style={{
          padding: '10px 14px', borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          ...(isUser
            ? { background: '#4f46e5', color: '#fff' }
            : { background: '#141414', color: '#d0d0d0', border: '1px solid #1e1e1e' }
          ),
        }}>
          {message.content || (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {[0, 150, 300].map(d => (
                <span key={d} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#6366f1',
                  animation: 'bounce 1s infinite', animationDelay: `${d}ms`,
                  display: 'inline-block',
                }} />
              ))}
            </span>
          )}
        </div>

        {/* Citations toggle */}
        {message.citations && message.citations.length > 0 && (
          <div>
            <button onClick={() => setShowCitations(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'none',
              border: 'none', cursor: 'pointer', color: '#777', padding: 0,
            }}
              onMouseEnter={e => (e.currentTarget.style.color = '#666')}
              onMouseLeave={e => (e.currentTarget.style.color = '#777')}
            >
              {showCitations ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {message.citations.length} source{message.citations.length > 1 ? 's' : ''}
            </button>
            {showCitations && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {message.citations.map(c => <CitationChip key={c.index} c={c} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
