const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function ingestSource(url: string, source_type: 'github' | 'api_docs') {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, source_type }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSources() {
  const res = await fetch(`${API_BASE}/ingest/sources`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSourceStatus(sourceId: string) {
  const res = await fetch(`${API_BASE}/ingest/sources/${sourceId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerEvalRun(source_id: string, source_type: string) {
  const res = await fetch(`${API_BASE}/evals/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, source_type }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchEvalResults(sourceId: string) {
  const res = await fetch(`${API_BASE}/evals/results/${sourceId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Stream a chat response using Fetch + ReadableStream.
 *
 * WHY not EventSource: EventSource only supports GET requests. Our chat
 * endpoint needs POST (to send the question in the body). We use fetch with
 * a ReadableStream reader instead — same streaming behavior, full control.
 */
export async function streamChat(
  question: string,
  sourceId: string,
  onToken: (token: string) => void,
  onCitations: (citations: any[]) => void,
  onDone: () => void,
) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, source_id: sourceId }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.type === 'token') onToken(payload.content)
      else if (payload.type === 'citations') onCitations(payload.citations)
      else if (payload.type === 'done') onDone()
    }
  }
}
