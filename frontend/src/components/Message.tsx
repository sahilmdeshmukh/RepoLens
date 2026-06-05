import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { Message, Citation } from '@/types'

function CitationItem({ citation }: { citation: Citation }) {
  if (citation.file_path) {
    return (
      <div className="text-xs px-2 py-1 rounded font-mono" style={{ background: 'var(--muted)' }}>
        [{citation.index}] {citation.file_path}
        {citation.start_line && ` :${citation.start_line}–${citation.end_line}`}
      </div>
    )
  }
  return (
    <a
      href={citation.page_url}
      target="_blank"
      rel="noreferrer"
      className="text-xs flex items-center gap-1 hover:underline"
      style={{ color: 'var(--primary)' }}
    >
      <ExternalLink size={10} />
      [{citation.index}] {citation.section_title || citation.page_url}
    </a>
  )
}

export function MessageBubble({ message }: { message: Message }) {
  const [showCitations, setShowCitations] = useState(false)
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className="px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap"
          style={
            isUser
              ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderBottomRightRadius: '4px' }
              : { background: 'var(--muted)', color: 'var(--foreground)', borderBottomLeftRadius: '4px' }
          }
        >
          {message.content}
          {!message.content && (
            <span className="inline-block w-1.5 h-4 animate-pulse ml-0.5" style={{ background: 'currentColor' }} />
          )}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="text-xs">
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="flex items-center gap-1"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {showCitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {message.citations.length} source{message.citations.length > 1 ? 's' : ''}
            </button>
            {showCitations && (
              <div className="mt-1 space-y-1">
                {message.citations.map((c) => (
                  <CitationItem key={c.index} citation={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
