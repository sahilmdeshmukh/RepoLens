import { useState } from 'react'
import { MessageSquare, BarChart2, Zap, BookOpen, Award } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { Chat } from '@/components/Chat'
import { EvalsTab } from '@/components/EvalsTab'
import type { Source } from '@/types'

type Tab = 'chat' | 'evals'

const FEATURES = [
  { icon: Zap, label: 'Hybrid Search', desc: 'Semantic + BM25 + RRF', color: '#f59e0b' },
  { icon: BookOpen, label: 'Source Citations', desc: 'Every answer is traceable', color: '#22c55e' },
  { icon: Award, label: 'Quality Evals', desc: 'LLM-as-judge scoring', color: '#818cf8' },
]

export default function App() {
  const [activeSource, setActiveSource] = useState<Source | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', overflow: 'hidden' }}>
      <Sidebar
        activeSourceId={activeSource?.id || null}
        onSelectSource={(s) => { setActiveSource(s); setActiveTab('chat') }}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeSource ? (
          <>
            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0 24px',
              borderBottom: '1px solid #1a1a1a', background: '#0d0d0d', flexShrink: 0,
            }}>
              {([
                { id: 'chat' as Tab, label: 'Chat', Icon: MessageSquare },
                { id: 'evals' as Tab, label: 'Evals', Icon: BarChart2 },
              ]).map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 16px', fontSize: 13, fontWeight: 500,
                  color: activeTab === id ? '#a5b4fc' : '#777',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${activeTab === id ? '#6366f1' : 'transparent'}`,
                  marginBottom: -1, transition: 'color 0.15s',
                }}>
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {activeTab === 'chat' ? <Chat source={activeSource} /> : <EvalsTab source={activeSource} />}
            </div>
          </>
        ) : (
          /* Welcome screen */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            {/* Glow effect */}
            <div style={{
              position: 'absolute', width: 400, height: 400, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            {/* Logo */}
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: '0 0 40px rgba(99,102,241,0.25)', marginBottom: 24,
            }}>
              <MessageSquare size={26} color="#fff" />
            </div>

            {/* Title */}
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8, letterSpacing: '-0.5px' }}>
              Welcome to RepoLens
            </h1>
            <p style={{ fontSize: 15, color: '#999', marginBottom: 40, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
              Index any GitHub repository or API documentation and start asking questions with full source citations.
            </p>

            {/* Feature cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 580 }}>
              {FEATURES.map(({ icon: Icon, label, desc, color }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  background: '#111', borderRadius: 12, border: '1px solid #1e1e1e', minWidth: 180,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${color}18`,
                  }}>
                    <Icon size={15} color={color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ebebeb' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Arrow hint */}
            <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 12 }}>
              <span>←</span>
              <span>Add a source from the sidebar to get started</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
