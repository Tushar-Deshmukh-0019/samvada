import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import type { TranscriptEntry } from '../../hooks/useAgentDashboard';
import { AUDIO_PLAYBACK_ENABLED } from '../../config/featureFlags';

interface TranscriptPanelProps {
  transcripts: TranscriptEntry[];
  language: string;
}

const BACKEND_URL = 'http://localhost:3000';

const LANG_LABELS: Record<string, string> = {
  kn: 'Kannada',
  kannada: 'Kannada',
  hi: 'Hindi',
  hindi: 'Hindi',
  en: 'English',
  english: 'English',
};

/** Resolve a relative /audio/:id path to the full backend URL */
function resolveAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith('http')) return audioUrl;
  return `${BACKEND_URL}${audioUrl}`;
}

export function TranscriptPanel({ transcripts, language }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Track which entry is currently playing so we can show a stop button
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const playAudio = (entryId: string, audioUrl: string) => {
    // Guard: do nothing if feature is disabled
    if (!AUDIO_PLAYBACK_ENABLED) return;

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    // If clicking the same entry that's playing, just stop it
    if (playingId === entryId) {
      setPlayingId(null);
      return;
    }

    const url = resolveAudioUrl(audioUrl);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay  = () => setPlayingId(entryId);
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingId(null); audioRef.current = null; };

    audio.play().catch((e) => {
      console.error('Audio playback failed:', e);
      setPlayingId(null);
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <span>Live Transcript</span>
        <span className="transcript-lang">
          {LANG_LABELS[language] || language?.toUpperCase() || 'EN'}
        </span>
      </div>

      <div className="transcript-list">
        {transcripts.length === 0 && (
          <div className="transcript-empty">Waiting for conversation...</div>
        )}

        {transcripts.map((entry) => {
          const isCitizen = entry.speaker === 'citizen';
          const isPlaying = playingId === entry.id;
          // Play button only shown when feature flag is ON and audio URL exists
          const hasAudio  = Boolean(AUDIO_PLAYBACK_ENABLED && entry.audioUrl);

          // Determine if original text differs from English
          const showEnglish =
            entry.englishText &&
            entry.englishText.trim() !== entry.originalText.trim();

          return (
            <div
              key={entry.id}
              className={`transcript-entry ${isCitizen ? 'citizen-entry' : 'ai-entry'}`}
            >
              {/* ── Header row ── */}
              <div className="transcript-entry-header">
                <span className="transcript-speaker">
                  {isCitizen ? '👤 Citizen' : '🤖 AI System'}
                </span>
                <span className="transcript-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {/* ── Original language block ── */}
              <div className="transcript-original">
                <div className="transcript-text-row">
                  <span className="transcript-lang-tag">
                    {LANG_LABELS[entry.language] || entry.language?.toUpperCase()}
                  </span>
                  <p className="transcript-text">{entry.originalText}</p>
                </div>

                {/* Play button — citizen: plays original mic recording
                                  AI: plays exact TTS audio sent to citizen */}
                {hasAudio && (
                  <button
                    className={`play-btn ${isPlaying ? 'play-btn-active' : ''}`}
                    onClick={() => playAudio(entry.id, entry.audioUrl!)}
                    title={
                      isCitizen
                        ? isPlaying ? 'Stop recording' : 'Play original recording'
                        : isPlaying ? 'Stop playback'  : 'Play AI voice response'
                    }
                    aria-label={isPlaying ? 'Stop' : 'Play'}
                  >
                    {isPlaying ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                    <span>{isPlaying ? 'Stop' : 'Play'}</span>
                  </button>
                )}
              </div>

              {/* ── English translation block (only when different from original) ── */}
              {showEnglish && (
                <div className="transcript-english">
                  <div className="transcript-text-row">
                    <span className="transcript-lang-tag en-tag">English</span>
                    <p className="transcript-text transcript-text-muted">{entry.englishText}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
