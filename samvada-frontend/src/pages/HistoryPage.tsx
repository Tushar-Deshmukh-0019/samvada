import { useState, useEffect, useCallback } from 'react';
import {
  fetchHistory, fetchStats, fetchSession, deleteSession,
  type SessionRecord, type StatsResponse,
} from '../services/historyApi';
import { AlertTriangle, Phone, Clock, BarChart2, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = { critical: '#ef4444', moderate: '#f59e0b', low: '#22c55e' };
const PRIORITY_BG     = { critical: '#450a0a', moderate: '#451a03', low: '#052e16' };

const AGENT_TYPE_CONFIG = {
  police:    { label: 'Police',       icon: '🚔', color: '#60a5fa' },
  ambulance: { label: 'Ambulance',    icon: '🚑', color: '#4ade80' },
  fire:      { label: 'Fire Brigade', icon: '🚒', color: '#fb923c' },
  general:   { label: 'General',      icon: '👤', color: '#94a3b8' },
};

const LANG_LABELS: Record<string, string> = { en: 'English', kn: 'Kannada', hi: 'Hindi' };

function formatDuration(start: string, end?: string): string {
  if (!end) return '—';
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: {
  label: string; value: number | string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="hist-stat-card" style={{ borderColor: color }}>
      <div className="hist-stat-icon" style={{ color }}>{icon}</div>
      <div className="hist-stat-value" style={{ color }}>{value}</div>
      <div className="hist-stat-label">{label}</div>
    </div>
  );
}

// ─── Session Detail Modal ─────────────────────────────────────────────────────

function SessionModal({ sessionId, onClose, onDelete }: {
  sessionId: string;
  onClose: () => void;
  onDelete: (sessionId: string) => void;
}) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetchSession(sessionId).then(s => { setSession(s); setLoading(false); });
  }, [sessionId]);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await deleteSession(sessionId);
    onDelete(sessionId);
    onClose();
  };

  return (
    <div className="hist-modal-overlay" onClick={onClose}>
      <div className="hist-modal" onClick={e => e.stopPropagation()}>
        <div className="hist-modal-header">
          <span className="hist-modal-title">Session {sessionId.slice(-8)}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!confirmDelete ? (
              <button className="hist-delete-btn" onClick={handleDelete} disabled={deleting} title="Delete session">
                <Trash2 size={15} /> Delete
              </button>
            ) : (
              <button className="hist-delete-confirm-btn" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : '⚠ Confirm Delete'}
              </button>
            )}
            {confirmDelete && !deleting && (
              <button className="hist-modal-close" onClick={() => setConfirmDelete(false)}>Cancel</button>
            )}
            <button className="hist-modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {loading && <div className="hist-modal-loading">Loading...</div>}

        {!loading && session && (
          <div className="hist-modal-body">
            {/* Meta row */}
            <div className="hist-modal-meta">
              <span className={`priority-badge priority-${session.priority}`}>
                {session.priority.toUpperCase()}
              </span>
              <span className="hist-meta-item">🕐 {formatTime(session.startTime)}</span>
              <span className="hist-meta-item">⏱ {formatDuration(session.startTime, session.endTime)}</span>
              <span className="hist-meta-item">🌐 {LANG_LABELS[session.language] ?? session.language}</span>
              {session.agentType && (
                <span className="hist-meta-item">
                  {AGENT_TYPE_CONFIG[session.agentType]?.icon} {AGENT_TYPE_CONFIG[session.agentType]?.label}
                </span>
              )}
            </div>

            {/* Summary */}
            {session.summary && (
              <div className="hist-modal-section">
                <div className="hist-section-label">Summary</div>
                <p className="hist-section-text">{session.summary}</p>
              </div>
            )}

            {/* Keywords */}
            {session.keywords && session.keywords.length > 0 && (
              <div className="hist-modal-section">
                <div className="hist-section-label">Keywords</div>
                <div className="keywords-list">
                  {session.keywords.map(k => (
                    <span key={k} className="keyword-tag">{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Collected info */}
            {Object.keys(session.collectedInfo || {}).length > 0 && (
              <div className="hist-modal-section">
                <div className="hist-section-label">Collected Info</div>
                {Object.entries(session.collectedInfo).map(([k, v]) => (
                  <div key={k} className="info-row">
                    <span>{k}</span>
                    <span className="info-value">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Location */}
            {session.location && (
              <div className="hist-modal-section">
                <div className="hist-section-label">Location</div>
                <p className="hist-section-text">
                  {session.location.readable ?? `${session.location.lat}, ${session.location.lng}`}
                </p>
              </div>
            )}

            {/* Transcripts */}
            {session.transcripts && session.transcripts.length > 0 && (
              <div className="hist-modal-section">
                <div className="hist-section-label">Transcript ({session.transcripts.length} turns)</div>
                <div className="hist-transcript-list">
                  {session.transcripts.map(t => (
                    <div key={t.id} className={`transcript-entry ${t.speaker === 'citizen' ? 'citizen-entry' : 'ai-entry'}`}>
                      <div className="transcript-entry-header">
                        <span className="transcript-speaker">
                          {t.speaker === 'citizen' ? '👤 Citizen' : '🤖 AI Dispatcher'}
                        </span>
                        <span className="transcript-time">
                          {new Date(t.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="transcript-text">{t.originalText}</p>
                      {t.englishText && t.englishText !== t.originalText && (
                        <p className="transcript-text" style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                          EN: {t.englishText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main History Page ────────────────────────────────────────────────────────

export function HistoryPage() {
  const [sessions, setSessions]       = useState<SessionRecord[]>([]);
  const [stats, setStats]             = useState<StatsResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [total, setTotal]             = useState(0);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAgentType, setFilterAgentType] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const handleDeleteSession = useCallback((deletedId: string) => {
    setSessions(prev => prev.filter(s => s.sessionId !== deletedId));
    setTotal(prev => prev - 1);
    // Refresh stats
    fetchStats().then(setStats);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hist, st] = await Promise.all([
        fetchHistory({ page, limit: 20, status: filterStatus, priority: filterPriority, agentType: filterAgentType }),
        fetchStats(),
      ]);
      setSessions(hist.data);
      setTotalPages(hist.meta.totalPages);
      setTotal(hist.meta.total);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterPriority, filterAgentType]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterPriority, filterAgentType]);

  return (
    <div className="agent-page">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-header-left">
          <span className="agent-logo">Samvada</span>
          <span className="agent-title">Session History & Analytics</span>
        </div>
        <div className="agent-header-right">
          <a href="/agent" className="hist-nav-link">← Live Dashboard</a>
        </div>
      </div>

      <div className="hist-page-body">

        {/* ── Stats Row ── */}
        {stats && (
          <div className="hist-stats-row">
            <StatCard label="Total Sessions" value={stats.total} color="#38bdf8" icon={<Phone size={20} />} />
            <StatCard label="Critical" value={stats.critical} color="#ef4444" icon={<AlertTriangle size={20} />} />
            <StatCard label="Escalated" value={stats.escalated} color="#f59e0b" icon={<AlertTriangle size={20} />} />
            <StatCard label="Avg Duration" value={
              stats.avgDurationSeconds < 60
                ? `${stats.avgDurationSeconds}s`
                : `${Math.floor(stats.avgDurationSeconds / 60)}m ${stats.avgDurationSeconds % 60}s`
            } color="#a78bfa" icon={<Clock size={20} />} />
            <StatCard label="Total Closed" value={stats.closed} color="#4ade80" icon={<BarChart2 size={20} />} />
          </div>
        )}

        {/* ── Breakdown Row ── */}
        {stats && (
          <div className="hist-breakdown-row">
            {/* Agent type */}
            <div className="hist-breakdown-card">
              <div className="hist-breakdown-title">By Agent Type</div>
              {Object.entries(stats.agentTypeBreakdown).map(([type, count]) => {
                const cfg = AGENT_TYPE_CONFIG[type as keyof typeof AGENT_TYPE_CONFIG];
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={type} className="breakdown-bar">
                    <span className="breakdown-label">{cfg?.icon} {cfg?.label ?? type}</span>
                    <div className="breakdown-track">
                      <div className="breakdown-fill" style={{ width: `${pct}%`, background: cfg?.color ?? '#94a3b8' }} />
                    </div>
                    <span className="breakdown-pct">{count}</span>
                  </div>
                );
              })}
              {Object.keys(stats.agentTypeBreakdown).length === 0 && (
                <p className="panel-empty">No data yet</p>
              )}
            </div>

            {/* Language */}
            <div className="hist-breakdown-card">
              <div className="hist-breakdown-title">By Language</div>
              {Object.entries(stats.languageBreakdown).map(([lang, count]) => {
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={lang} className="breakdown-bar">
                    <span className="breakdown-label">{LANG_LABELS[lang] ?? lang}</span>
                    <div className="breakdown-track">
                      <div className="breakdown-fill" style={{ width: `${pct}%`, background: '#38bdf8' }} />
                    </div>
                    <span className="breakdown-pct">{count}</span>
                  </div>
                );
              })}
              {Object.keys(stats.languageBreakdown).length === 0 && (
                <p className="panel-empty">No data yet</p>
              )}
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="hist-filters">
          <select className="hist-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="escalated">Escalated</option>
            <option value="closed">Closed</option>
          </select>
          <select className="hist-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
          <select className="hist-filter-select" value={filterAgentType} onChange={e => setFilterAgentType(e.target.value)}>
            <option value="">All Agent Types</option>
            <option value="police">Police</option>
            <option value="ambulance">Ambulance</option>
            <option value="fire">Fire Brigade</option>
            <option value="general">General</option>
          </select>
          <span className="hist-total-label">{total} sessions</span>
        </div>

        {/* ── Table ── */}
        <div className="hist-table-wrap">
          {loading ? (
            <div className="hist-loading">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="hist-empty">No sessions found. Start a call to see history here.</div>
          ) : (
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Language</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Agent Type</th>
                  <th>Summary</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const agentCfg = s.agentType ? AGENT_TYPE_CONFIG[s.agentType] : null;
                  return (
                    <tr key={s.sessionId} className="hist-table-row" onClick={() => setSelectedSessionId(s.sessionId)}>
                      <td className="hist-session-id">{s.sessionId.slice(-8)}</td>
                      <td className="hist-cell-muted">{formatTime(s.startTime)}</td>
                      <td className="hist-cell-muted">{formatDuration(s.startTime, s.endTime)}</td>
                      <td>{LANG_LABELS[s.language] ?? s.language}</td>
                      <td>
                        <span
                          className="priority-badge"
                          style={{ background: PRIORITY_BG[s.priority], color: PRIORITY_COLORS[s.priority] }}
                        >
                          {s.priority.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${s.status}`}>{s.status}</span>
                      </td>
                      <td>
                        {agentCfg ? (
                          <span style={{ color: agentCfg.color }}>{agentCfg.icon} {agentCfg.label}</span>
                        ) : '—'}
                      </td>
                      <td className="hist-summary-cell">
                        {s.summary ? s.summary.slice(0, 80) + (s.summary.length > 80 ? '…' : '') : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className="hist-row-delete-btn"
                          title="Delete session"
                          onClick={async () => {
                            if (window.confirm(`Delete session ${s.sessionId.slice(-8)}? This removes all transcripts and audio.`)) {
                              await deleteSession(s.sessionId);
                              handleDeleteSession(s.sessionId);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="hist-pagination">
            <button
              className="hist-page-btn"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="hist-page-info">Page {page} of {totalPages}</span>
            <button
              className="hist-page-btn"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Session Detail Modal ── */}
      {selectedSessionId && (
        <SessionModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          onDelete={handleDeleteSession}
        />
      )}
    </div>
  );
}
