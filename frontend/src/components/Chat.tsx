import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageBubble } from './Message'
import { streamChat } from '@/lib/api'
import type { Message, Source } from '@/types'

interface ChatProps {
  source: Source
}

let msgCounter = 0
const nextId = () => String(++msgCounter)

export function Chat({ source }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isStreaming) return
    setInput('')

    const userMsg: Message = { id: nextId(), role: 'user', content: question }
    const assistantId = nextId()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    await streamChat(
      question,
      source.id,
      (token) => setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token } : m)
      ),
      (citations) => setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, citations } : m)
      ),
      () => setIsStreaming(false),
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        Chatting with <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{source.name}</span>
        <span className="ml-2 text-xs">({source.chunk_count} chunks indexed)</span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm mt-8" style={{ color: 'var(--muted-foreground)' }}>
            Ask anything about <strong>{source.name}</strong>
          </p>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-4 py-3 flex gap-2" style={{ borderColor: 'var(--border)' }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask a question..."
          disabled={isStreaming}
        />
        <Button onClick={handleSend} disabled={isStreaming || !input.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
