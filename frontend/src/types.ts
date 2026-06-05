export interface Source {
  id: string
  url: string
  source_type: 'github' | 'api_docs'
  name: string
  status: 'pending' | 'processing' | 'complete' | 'failed'
  chunk_count: number
  error: string | null
  created_at: string
}

export interface Citation {
  index: number
  file_path?: string
  start_line?: number
  end_line?: number
  repo_url?: string
  page_url?: string
  section_title?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export interface EvalResult {
  id: string
  source_id: string
  run_at: string
  question: string
  generated_answer: string
  expected_answer: string
  retrieved_texts: string
  token_overlap_f1: number
  faithfulness: number | null
  relevance: number | null
  judge_reasoning: string
}

export interface EvalSummary {
  total: number
  avg_token_overlap_f1: number
  avg_faithfulness: number
  avg_relevance: number
}
