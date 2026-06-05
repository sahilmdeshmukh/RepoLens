import { useState } from 'react'
import { MessageSquare, FlaskConical } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sidebar } from '@/components/Sidebar'
import { Chat } from '@/components/Chat'
import { EvalsTab } from '@/components/EvalsTab'
import type { Source } from '@/types'

export default function App() {
  const [activeSource, setActiveSource] = useState<Source | null>(null)

  return (
    <div className="flex h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Sidebar activeSourceId={activeSource?.id || null} onSelectSource={setActiveSource} />

      <div className="flex-1 overflow-hidden">
        {activeSource ? (
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-3 w-fit">
              <TabsTrigger value="chat" className="flex items-center gap-1.5">
                <MessageSquare size={14} /> Chat
              </TabsTrigger>
              <TabsTrigger value="evals" className="flex items-center gap-1.5">
                <FlaskConical size={14} /> Evals
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              <Chat source={activeSource} />
            </TabsContent>
            <TabsContent value="evals" className="flex-1 overflow-hidden mt-0">
              <EvalsTab source={activeSource} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold">Welcome to RepoLens</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Index a GitHub repo or API docs to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
