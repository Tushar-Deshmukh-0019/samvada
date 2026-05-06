import { useState } from 'react';
import { Edit2, Save, MapPin, Mic, MicOff } from 'lucide-react';
import type { ActiveCall } from '../../hooks/useAgentDashboard';

interface SummaryPanelProps {
  call: ActiveCall;
  isTakenOver: boolean;
  agentMicActive: boolean;
  onOverride: (interpretation: string, sentiment: string) => void;
  onToggleMic: () => void;
}

export function SummaryPanel({ call, isTakenOver, agentMicActive, onOverride, onToggleMic }: SummaryPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(call.summary || '');

  const handleSave = () => {
    onOverride(editedSummary, call.latestEmotion?.sentimentPolarity || 'neutral');
    setIsEditing(false);
  };

  const isCallClosed = call.status === 'closed';

  return (
    <div className="summary-panel">
      <div className="panel-header">Call Summary & Controls</div>

      {/* Summary */}
      <div className="summary-section">
        <div className="summary-label">
          AI Interpretation
          <button
            className="edit-btn"
            onClick={() => { setIsEditing(!isEditing); setEditedSummary(call.summary || ''); }}
          >
            <Edit2 size={12} /> {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {isEditing ? (
          <div className="edit-area">
            <textarea
              className="summary-textarea"
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              rows={4}
            />
            <button className="save-btn" onClick={handleSave}>
              <Save size={14} /> Save Override
            </button>
          </div>
        ) : (
          <p className="summary-text">{call.summary || 'No summary yet...'}</p>
        )}
      </div>

      {/* Keywords */}
      {call.keywords && call.keywords.length > 0 && (
        <div className="keywords-section">
          <div className="summary-label">Keywords</div>
          <div className="keywords-list">
            {call.keywords.map((kw, i) => (
              <span key={i} className="keyword-tag">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Location */}
      {call.location && (
        <div className="location-section">
          <div className="summary-label">
            <MapPin size={12} /> Location
          </div>
          <div className="location-text">
            {call.location.readable || `${call.location.lat?.toFixed(4)}, ${call.location.lng?.toFixed(4)}`}
          </div>
        </div>
      )}

      {/* Live Mic — replaces the old text message section */}
      <div className="agent-mic-section">
        <div className="summary-label">Live Call</div>

        {!isTakenOver ? (
          <div className="agent-mic-waiting">
            <MicOff size={18} />
            <span>Take over the call to speak with the citizen</span>
          </div>
        ) : isCallClosed ? (
          <div className="agent-mic-waiting">
            <MicOff size={18} />
            <span>Call has ended</span>
          </div>
        ) : (
          <div className="agent-mic-controls">
            <button
              className={`agent-mic-btn ${agentMicActive ? 'agent-mic-btn--active' : ''}`}
              onClick={onToggleMic}
              title={agentMicActive ? 'Stop speaking' : 'Speak to citizen'}
            >
              <div className="agent-mic-btn-icon">
                {agentMicActive ? <Mic size={22} /> : <Mic size={22} />}
              </div>
            </button>
            <div className="agent-mic-status">
              {agentMicActive ? (
                <span className="agent-mic-status--live">● Live — speaking to citizen</span>
              ) : (
                <span className="agent-mic-status--idle">Tap mic to speak</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Session Info */}
      <div className="session-info">
        <div className="info-row">
          <span>Session ID</span>
          <span className="info-value">{call.sessionId.slice(-12)}</span>
        </div>
        <div className="info-row">
          <span>Language</span>
          <span className="info-value">{call.language?.toUpperCase()}</span>
        </div>
        <div className="info-row">
          <span>Status</span>
          <span className={`status-badge status-${call.status}`}>{call.status}</span>
        </div>
        <div className="info-row">
          <span>Started</span>
          <span className="info-value">{new Date(call.startTime).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
