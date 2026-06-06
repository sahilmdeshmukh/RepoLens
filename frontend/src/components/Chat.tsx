import { useState, useRef, useEffect } from 'react'
import { Send, Code2, Globe, Sparkles } from 'lucide-react'
import { MessageBubble } from './Message'
import { streamChat } from '@/lib/api'
import type { Message, Source } from '@/types'

interface ChatProps { source: Source }

let msgCounter = 0
const nextId = () => String(++msgCounter)

const SUGGESTIONS = [
  'What does this repo do?',
  'How is authentication handled?',
  'What are the main dependencies?',
  'How do I get started with this?',
]

export function Chat({ source }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (question: string) => {
    if (!question.trim() || isStreaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: Message = { id: nextId(), role: 'user', content: question }
    const aId = nextId()
    setMessages(prev => [...prev, userMsg, { id: aId, role: 'assistant', content: '' }])
    setIsStreaming(true)

    await streamChat(question, source.id,
      token => setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + token } : m)),
      citations => setMessages(prev => prev.map(m => m.id === aId ? { ...m, citations } : m)),
      () => setIsStreaming(false),
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0a' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px',
        borderBottom: '1px solid #161616', background: '#0d0d0d', flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: source.source_type === 'github' ? '#1a1a2e' : '#0d1e18',
        }}>
          {source.source_type === 'github'
            ? <Code2 size={15} color="#818cf8" />
            : <Globe size={15} color="#34d399" />}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>{source.name}</div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 1 }}>
            {source.chunk_count.toLocaleString()} chunks indexed
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 8px' }}>
        {messages.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                boxShadow: '0 0 24px rgba(99,102,241,0.2)',
              }}>
                <Sparkles size={20} color="#fff" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#d0d0d0', marginBottom: 6 }}>
                Ask anything about {source.name}
              </div>
              <div style={{ fontSize: 12, color: '#777' }}>
                Powered by hybrid semantic + keyword search
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 480 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => sendMessage(s)} style={{
                  padding: '12px 14px', borderRadius: 10, fontSize: 12, textAlign: 'left', cursor: 'pointer',
                  background: '#111', color: '#888', border: '1px solid #1e1e1e', transition: 'all 0.15s',
                  lineHeight: 1.4,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#c0c0c0'; e.currentTarget.style.background = '#151520' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#888'; e.currentTarget.style.background = '#111' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(m => <MessageBubble key={m.id} message={m} />)}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '12px 24px 20px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px',
          background: '#111', border: '1px solid #1e1e1e', borderRadius: 14,
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = '#4f46e5')}
          onBlurCapture={e => (e.currentTarget.style.borderColor = '#1e1e1e')}
        >
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} disabled={isStreaming} rows={1}
            placeholder="Ask a question… (Enter to send)"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
              fontSize: 13, color: '#d0d0d0', lineHeight: 1.5, maxHeight: 120, overflow: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={e => {
              const t = e.currentTarget; t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 120) + 'px'
            }}
          />
          <button onClick={() => sendMessage(input)} disabled={isStreaming || !input.trim()} style={{
            width: 32, height: 32, borderRadius: 9, border: 'none', cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: input.trim() && !isStreaming ? '#4f46e5' : '#1e1e1e',
            transition: 'background 0.15s',
          }}>
            <Send size={14} color={input.trim() && !isStreaming ? '#fff' : '#777'} />
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#555', textAlign: 'center', marginTop: 8 }}>
          Answers grounded in indexed source · Sources cited below each response
        </div>
      </div>
    </div>
  )
}
