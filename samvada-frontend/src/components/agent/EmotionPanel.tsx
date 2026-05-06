import type { EmotionData, PriorityData } from '../../hooks/useAgentDashboard';

interface EmotionPanelProps {
  emotion: EmotionData | undefined;
  priority: PriorityData | undefined;
  emotionHistory: Array<{ emotion: string; score: number; urgency: number; timestamp: string }>;
}

const EMOTION_COLORS: Record<string, string> = {
  panic: '#ef4444',
  distress: '#f97316',
  anger: '#dc2626',
  fear: '#a855f7',
  confusion: '#f59e0b',
  urgency: '#f97316',
  sadness: '#6366f1',
  neutral: '#6b7280',
  calm: '#22c55e',
};

const EMOTION_ICONS: Record<string, string> = {
  panic: '😱',
  distress: '😰',
  anger: '😠',
  fear: '😨',
  confusion: '😕',
  urgency: '⚡',
  sadness: '😢',
  neutral: '😐',
  calm: '😌',
};

const PRIORITY_COLORS = {
  critical: { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' },
  moderate: { bg: '#fffbeb', border: '#f59e0b', text: '#d97706' },
  low: { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' },
};

export function EmotionPanel({ emotion, priority, emotionHistory }: EmotionPanelProps) {
  if (!emotion) {
    return (
      <div className="emotion-panel">
        <div className="panel-header">Emotion & Priority</div>
        <div className="panel-empty">Waiting for analysis...</div>
      </div>
    );
  }

  const pColors = priority ? PRIORITY_COLORS[priority.level] : PRIORITY_COLORS.low;
  const emotionColor = EMOTION_COLORS[emotion.primaryEmotion] || '#6b7280';

  return (
    <div className="emotion-panel">
      <div className="panel-header">Emotion & Priority</div>

      {/* Priority Badge */}
      {priority && (
        <div
          className="priority-card"
          style={{ background: pColors.bg, borderColor: pColors.border }}
        >
          <div className="priority-level" style={{ color: pColors.text }}>
            {priority.level === 'critical' && '🚨 '}
            {priority.level === 'moderate' && '⚠️ '}
            {priority.level === 'low' && '✅ '}
            {priority.level.toUpperCase()} PRIORITY
          </div>
          <div className="priority-score">Score: {priority.score}/100</div>
          {priority.reasons.length > 0 && (
            <ul className="priority-reasons">
              {priority.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Primary Emotion */}
      <div className="emotion-primary" style={{ borderLeftColor: emotionColor }}>
        <span className="emotion-icon">{EMOTION_ICONS[emotion.primaryEmotion]}</span>
        <div className="emotion-details">
          <div className="emotion-name" style={{ color: emotionColor }}>
            {emotion.primaryEmotion.toUpperCase()}
          </div>
          <div className="emotion-scores">
            <span>Intensity: {Math.round(emotion.emotionScore * 100)}%</span>
            <span>Urgency: {Math.round(emotion.urgencyScore * 100)}%</span>
          </div>
          <div className={`sentiment-badge sentiment-${emotion.sentimentPolarity}`}>
            {emotion.sentimentPolarity}
          </div>
        </div>
      </div>

      {/* Emotion Breakdown */}
      <div className="emotion-breakdown">
        <div className="breakdown-title">Emotion Breakdown</div>
        {Object.entries(emotion.emotionBreakdown)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([emo, score]) => (
            <div key={emo} className="breakdown-bar">
              <span className="breakdown-label">
                {EMOTION_ICONS[emo]} {emo}
              </span>
              <div className="breakdown-track">
                <div
                  className="breakdown-fill"
                  style={{
                    width: `${Math.round(score * 100)}%`,
                    background: EMOTION_COLORS[emo] || '#6b7280',
                  }}
                />
              </div>
              <span className="breakdown-pct">{Math.round(score * 100)}%</span>
            </div>
          ))}
      </div>

      {/* Emotion History */}
      {emotionHistory.length > 1 && (
        <div className="emotion-history">
          <div className="breakdown-title">Emotion Timeline</div>
          <div className="history-dots">
            {emotionHistory.slice(-8).map((h, i) => (
              <div
                key={i}
                className="history-dot"
                style={{ background: EMOTION_COLORS[h.emotion] || '#6b7280' }}
                title={`${h.emotion} (${Math.round(h.urgency * 100)}% urgency)`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
