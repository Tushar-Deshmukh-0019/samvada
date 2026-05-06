
import { CallList } from '../components/agent/CallList';
import { TranscriptPanel } from '../components/agent/TranscriptPanel';
import { EmotionPanel } from '../components/agent/EmotionPanel';
import { SummaryPanel } from '../components/agent/SummaryPanel';
import { useAgentDashboard } from '../hooks/useAgentDashboard';
import { AlertTriangle, X } from 'lucide-react';

export function AgentPage() {
  const {
    activeCalls,
    selectedCall,
    selectedSessionId,
    escalationAlerts,
    takenOverSessions,
    agentMicActive,
    setSelectedSessionId,
    takeoverCall,
    toggleAgentMic,
    overrideInterpretation,
    dismissAlert,
  } = useAgentDashboard();

  return (
    <div className="agent-page">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-header-left">
          <span className="agent-logo">Samvada</span>
          <span className="agent-title">Agent Dashboard — 1092 Helpline</span>
        </div>
        <div className="agent-header-right">
          <span className="active-count">
            {activeCalls.filter(c => c.status !== 'closed').length} Active Calls
          </span>
          {escalationAlerts.length > 0 && (
            <span className="alert-badge">
              <AlertTriangle size={14} /> {escalationAlerts.length} Escalation{escalationAlerts.length > 1 ? 's' : ''}
            </span>
          )}
          <a href="/agent/history" className="hist-nav-link">📊 History</a>
        </div>
      </div>

      {/* Escalation Alerts */}
      {escalationAlerts.map((sessionId) => (
        <div key={sessionId} className="escalation-banner">
          <AlertTriangle size={16} />
          <span>
            Call <strong>{sessionId.slice(-8)}</strong> needs immediate attention
          </span>
          <button className="takeover-banner-btn" onClick={() => takeoverCall(sessionId)}>
            Take Over
          </button>
          <button className="dismiss-btn" onClick={() => dismissAlert(sessionId)}>
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Main Layout */}
      <div className="agent-layout">
        {/* Left: Call List */}
        <div className="agent-sidebar">
          <CallList
            calls={activeCalls}
            selectedSessionId={selectedSessionId}
            escalationAlerts={escalationAlerts}
            onSelect={setSelectedSessionId}
            onTakeover={takeoverCall}
          />
        </div>

        {/* Center: Transcript */}
        <div className="agent-main">
          {selectedCall ? (
            <TranscriptPanel
              transcripts={selectedCall.transcripts}
              language={selectedCall.language}
            />
          ) : (
            <div className="agent-empty">
              <div className="empty-icon">📞</div>
              <p>Select a call to view transcript</p>
            </div>
          )}
        </div>

        {/* Right: Emotion + Summary */}
        <div className="agent-right">
          {selectedCall ? (
            <>
              <EmotionPanel
                emotion={selectedCall.latestEmotion}
                priority={selectedCall.latestPriority}
                emotionHistory={selectedCall.emotionHistory}
              />
              <SummaryPanel
                call={selectedCall}
                isTakenOver={takenOverSessions.has(selectedCall.sessionId)}
                agentMicActive={agentMicActive === selectedCall.sessionId}
                onOverride={(interp, sent) =>
                  overrideInterpretation(selectedCall.sessionId, interp, sent)
                }
                onToggleMic={() => toggleAgentMic(selectedCall.sessionId)}
              />
            </>
          ) : (
            <div className="agent-empty-right">
              <p>Select a call to view analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
