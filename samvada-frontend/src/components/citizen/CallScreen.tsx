import { useEffect, useState } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Loader,
  Grid3x3,
  Volume2,
  PhoneForwarded,
  PauseCircle,
  Video,
} from 'lucide-react';
import type { CallStatus, AIResponse } from '../../hooks/useCallSession';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';

interface CallScreenProps {
  callStatus: CallStatus;
  sessionId: string | null;
  processingStatus: string;
  aiResponse: AIResponse | null;
  isEscalated: boolean;
  escalationMessage: string;
  sttRetryMessage: string;
  onEndCall: () => void;
  onVerificationFeedback: (f: 'correct' | 'partial' | 'incorrect') => void;
}

export function CallScreen({
  callStatus,
  sessionId,
  processingStatus,
  aiResponse,
  isEscalated,
  escalationMessage,
  sttRetryMessage,
  onEndCall,
  onVerificationFeedback,
}: CallScreenProps) {
  const [callDuration, setCallDuration] = useState(0);

  const { isRecording, toggleRecording, error: micError } = useAudioRecorder({
    sessionId,
  });

  // Timer
  useEffect(() => {
    if (callStatus === 'active' || callStatus === 'processing' || callStatus === 'verifying') {
      const interval = setInterval(() => setCallDuration((d) => d + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [callStatus]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Connecting screen
  if (callStatus === 'connecting') {
    return (
      <div className="call-screen connecting">
        <div className="call-animation">
          <div className="pulse-ring" />
          <div className="pulse-ring delay-1" />
          <div className="pulse-ring delay-2" />
          <PhoneForwarded size={36} className="call-icon" />
        </div>
        <p className="connecting-text">Calling 1092…</p>
        <p className="connecting-sub">Government of Karnataka Helpline</p>
      </div>
    );
  }

  const isMuted = !isRecording;
  const isDisabled = callStatus === 'processing' || callStatus === 'escalated';

  return (
    <div className="call-screen active">
      {/* Header — avatar + name + timer */}
      <div className="call-header">
        <div className="call-avatar">1</div>
        <div className="call-number">1092</div>
        <div className="call-label">Karnataka Helpline</div>
        <div className="call-timer">{formatDuration(callDuration)}</div>
      </div>

      {/* Status Banner */}
      <div className={`status-banner status-${callStatus}`}>
        {callStatus === 'processing' && (
          <span className="status-text">
            <Loader size={13} className="spin" /> {processingStatus || 'Processing…'}
          </span>
        )}
        {callStatus === 'active' && !isEscalated && (
          <span className="status-text">● Connected</span>
        )}
        {callStatus === 'verifying' && (
          <span className="status-text">⟳ Verifying understanding…</span>
        )}
        {callStatus === 'escalated' && (
          <span className="status-text">👤 Human agent connected</span>
        )}
      </div>

      {/* AI Response */}
      {aiResponse && (
        <div className="ai-response-box">
          <div className="ai-response-label">AI Assistant</div>
          <p className="ai-response-text">{aiResponse.text}</p>
        </div>
      )}

      {/* STT Retry */}
      {sttRetryMessage && (
        <div className="retry-message">⚠ {sttRetryMessage}</div>
      )}

      {/* Escalation Notice */}
      {isEscalated && (
        <div className="escalation-popup">
          <div className="escalation-icon">👤</div>
          <div className="escalation-text">
            <strong>Call Transferred to Agent</strong>
            <p>{escalationMessage}</p>
          </div>
        </div>
      )}

      {/* Verification Buttons */}
      {callStatus === 'verifying' && aiResponse?.requiresConfirmation && (
        <div className="verification-buttons">
          <p className="verification-label">Is this understanding correct?</p>
          <div className="verification-row">
            <button className="verify-btn verify-correct" onClick={() => onVerificationFeedback('correct')}>
              ✓ Yes
            </button>
            <button className="verify-btn verify-partial" onClick={() => onVerificationFeedback('partial')}>
              ~ Partly
            </button>
            <button className="verify-btn verify-incorrect" onClick={() => onVerificationFeedback('incorrect')}>
              ✗ No
            </button>
          </div>
        </div>
      )}

      {/* Mic Error */}
      {micError && <div className="mic-error">⚠ {micError}</div>}

      {/* Controls — Google Phone style */}
      <div className="call-controls">
        {/* 2×3 action grid */}
        <div className="call-action-grid">
          {/* Mute */}
          <button
            className={`mic-btn ${isMuted ? 'mic-active' : ''}`}
            onClick={toggleRecording}
            disabled={isDisabled}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <div className="mic-btn-icon">
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </div>
            <span className="mic-btn-label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {/* Keypad (decorative) */}
          <button className="action-btn" disabled aria-label="Keypad">
            <div className="action-btn-icon">
              <Grid3x3 size={22} />
            </div>
            <span className="action-btn-label">Keypad</span>
          </button>

          {/* Speaker (decorative) */}
          <button className="action-btn" disabled aria-label="Speaker">
            <div className="action-btn-icon">
              <Volume2 size={22} />
            </div>
            <span className="action-btn-label">Speaker</span>
          </button>

          {/* Add call (decorative) */}
          <button className="action-btn" disabled aria-label="Add call">
            <div className="action-btn-icon">
              <PhoneForwarded size={22} />
            </div>
            <span className="action-btn-label">Add call</span>
          </button>

          {/* Hold (decorative) */}
          <button className="action-btn" disabled aria-label="Hold">
            <div className="action-btn-icon">
              <PauseCircle size={22} />
            </div>
            <span className="action-btn-label">Hold</span>
          </button>

          {/* Video (decorative) */}
          <button className="action-btn" disabled aria-label="Video">
            <div className="action-btn-icon">
              <Video size={22} />
            </div>
            <span className="action-btn-label">Video</span>
          </button>
        </div>

        {/* End call — centered red circle */}
        <button className="end-call-btn" onClick={onEndCall} aria-label="End call">
          <PhoneOff size={28} />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
}
