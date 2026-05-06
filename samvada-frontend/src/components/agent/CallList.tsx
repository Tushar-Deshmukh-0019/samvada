import { Phone, AlertTriangle, User } from 'lucide-react';
import type { ActiveCall } from '../../hooks/useAgentDashboard';

interface CallListProps {
  calls: ActiveCall[];
  selectedSessionId: string | null;
  escalationAlerts: string[];
  onSelect: (sessionId: string) => void;
  onTakeover: (sessionId: string) => void;
}

const PRIORITY_COLORS = {
  critical: '#ef4444',
  moderate: '#f59e0b',
  low: '#22c55e',
};

const EMOTION_ICONS: Record<string, string> = {
  panic: '😱', distress: '😰', anger: '😠', fear: '😨',
  confusion: '😕', urgency: '⚡', sadness: '😢', neutral: '😐', calm: '😌',
};

// ── Agent type badge config ───────────────────────────────────────────────────
const AGENT_TYPE_CONFIG: Record<
  NonNullable<ActiveCall['agentType']>,
  { label: string; icon: string; bg: string; color: string; border: string }
> = {
  police:    { label: 'Police',       icon: '🚔', bg: '#1e3a5f', color: '#60a5fa', border: '#3b82f6' },
  ambulance: { label: 'Ambulance',    icon: '🚑', bg: '#1a2e1a', color: '#4ade80', border: '#22c55e' },
  fire:      { label: 'Fire Brigade', icon: '🚒', bg: '#3c1a00', color: '#fb923c', border: '#f97316' },
  general:   { label: 'General',      icon: '👤', bg: '#1e293b', color: '#94a3b8', border: '#475569' },
};

export function CallList({ calls, selectedSessionId, escalationAlerts, onSelect, onTakeover }: CallListProps) {
  const sorted = [...calls].sort((a, b) => {
    const pOrder = { critical: 0, moderate: 1, low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  return (
    <div className="call-list">
      <div className="call-list-header">
        <Phone size={16} />
        <span>Active Calls ({calls.filter(c => c.status !== 'closed').length})</span>
      </div>

      {sorted.length === 0 && (
        <div className="call-list-empty">No active calls</div>
      )}

      {sorted.map((call) => {
        const isEscalated = escalationAlerts.includes(call.sessionId);
        const isSelected  = call.sessionId === selectedSessionId;
        const emotion     = call.latestEmotion?.primaryEmotion || 'neutral';
        const agentCfg    = call.agentType ? AGENT_TYPE_CONFIG[call.agentType] : null;
        // Show badge once the call is escalated or taken over
        const showAgentBadge = agentCfg && call.status === 'escalated';

        return (
          <div
            key={call.sessionId}
            className={`call-item ${isSelected ? 'selected' : ''} ${isEscalated ? 'escalated' : ''} priority-${call.priority}`}
            onClick={() => onSelect(call.sessionId)}
          >
            <div className="call-item-left">
              <div
                className="priority-dot"
                style={{ background: PRIORITY_COLORS[call.priority] }}
                title={`Priority: ${call.priority}`}
              />
              <div className="call-item-info">
                <div className="call-item-id">
                  {call.sessionId.slice(-8)}
                </div>
                <div className="call-item-meta">
                  <span>{EMOTION_ICONS[emotion]} {emotion}</span>
                  <span className="call-item-lang">{call.language?.toUpperCase()}</span>
                </div>

                {/* ── Agent type badge ── */}
                {showAgentBadge && (
                  <div
                    className="agent-type-badge"
                    style={{
                      background: agentCfg.bg,
                      color: agentCfg.color,
                      border: `1px solid ${agentCfg.border}`,
                    }}
                    title={`Connected to: ${agentCfg.label}`}
                  >
                    <span className="agent-type-icon">{agentCfg.icon}</span>
                    <span className="agent-type-label">{agentCfg.label}</span>
                  </div>
                )}

                {call.summary && (
                  <div className="call-item-summary">{call.summary.slice(0, 60)}...</div>
                )}
              </div>
            </div>

            <div className="call-item-right">
              <span className={`priority-badge priority-${call.priority}`}>
                {call.priority.toUpperCase()}
              </span>
              {isEscalated && (
                <button
                  className="takeover-btn"
                  onClick={(e) => { e.stopPropagation(); onTakeover(call.sessionId); }}
                  title="Take over this call"
                >
                  <User size={14} /> Take Over
                </button>
              )}
              {call.status === 'escalated' && !isEscalated && (
                <span className="escalated-badge">
                  <AlertTriangle size={12} /> Escalated
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
