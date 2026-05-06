const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export interface SessionRecord {
  sessionId: string;
  language: string;
  status: string;
  priority: 'critical' | 'moderate' | 'low';
  agentType?: 'police' | 'ambulance' | 'fire' | 'general';
  conversationPhase: string;
  summary?: string;
  keywords?: string[];
  location?: { lat: number; lng: number; readable?: string };
  collectedInfo: Record<string, string>;
  emotionHistory?: Array<{ emotion: string; score: number; urgency: number; timestamp: string }>;
  startTime: string;
  endTime?: string;
  transcripts?: TranscriptRecord[];
}

export interface TranscriptRecord {
  id: string;
  sessionId: string;
  speaker: 'citizen' | 'ai';
  originalText: string;
  englishText?: string;
  language: string;
  timestamp: string;
  audioUrl?: string;
}

export interface HistoryResponse {
  data: SessionRecord[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface StatsResponse {
  total: number;
  critical: number;
  escalated: number;
  closed: number;
  active: number;
  avgDurationSeconds: number;
  agentTypeBreakdown: Record<string, number>;
  languageBreakdown: Record<string, number>;
}

export async function fetchHistory(params: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  agentType?: string;
}): Promise<HistoryResponse> {
  const q = new URLSearchParams();
  if (params.page)      q.set('page', String(params.page));
  if (params.limit)     q.set('limit', String(params.limit));
  if (params.status)    q.set('status', params.status);
  if (params.priority)  q.set('priority', params.priority);
  if (params.agentType) q.set('agentType', params.agentType);

  const res = await fetch(`${BACKEND_URL}/sessions/history?${q}`);
  return res.json();
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${BACKEND_URL}/sessions/stats`);
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionRecord> {
  const res = await fetch(`${BACKEND_URL}/sessions/history/${sessionId}`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<{ success: boolean; audioFilesDeleted: number }> {
  const res = await fetch(`${BACKEND_URL}/sessions/history/${sessionId}`, { method: 'DELETE' });
  return res.json();
}
