import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';

export interface TranscriptEntry {
  id: string;
  speaker: 'citizen' | 'ai';
  originalText: string;
  englishText?: string;
  language: string;
  timestamp: string;
  audioUrl?: string;
}

export interface EmotionData {
  primaryEmotion: string;
  emotionScore: number;
  urgencyScore: number;
  sentimentPolarity: string;
  isCritical: boolean;
  emotionBreakdown: Record<string, number>;
}

export interface PriorityData {
  level: 'critical' | 'moderate' | 'low';
  score: number;
  reasons: string[];
}

export interface ActiveCall {
  sessionId: string;
  status: string;
  priority: 'critical' | 'moderate' | 'low';
  startTime: string;
  language: string;
  transcripts: TranscriptEntry[];
  emotionHistory: Array<{ emotion: string; score: number; urgency: number; timestamp: string }>;
  summary?: string;
  keywords?: string[];
  location?: { lat: number; lng: number; readable?: string };
  latestEmotion?: EmotionData;
  latestPriority?: PriorityData;
  agentType?: 'police' | 'ambulance' | 'fire' | 'general';
}

export function useAgentDashboard() {
  const [activeCalls, setActiveCalls] = useState<Map<string, ActiveCall>>(new Map());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [escalationAlerts, setEscalationAlerts] = useState<string[]>([]);
  // Sessions this agent has taken over — mic becomes available for these
  const [takenOverSessions, setTakenOverSessions] = useState<Set<string>>(new Set());
  // Which session the agent is currently speaking into (null = not recording)
  const [agentMicActive, setAgentMicActive] = useState<string | null>(null);
  const agentMediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('agent_join');

    socket.on('active_sessions', ({ sessions }: { sessions: ActiveCall[] }) => {
      const map = new Map<string, ActiveCall>();
      sessions.forEach((s) => map.set(s.sessionId, s));
      setActiveCalls(map);
    });

    socket.on('new_call', (data: { sessionId: string; startTime: string; location?: any }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        next.set(data.sessionId, {
          sessionId: data.sessionId,
          status: 'active',
          priority: 'low',
          startTime: data.startTime,
          language: 'en',
          transcripts: [],
          emotionHistory: [],
          location: data.location,
        });
        return next;
      });
    });

    socket.on('live_transcript', ({ sessionId, transcript }: { sessionId: string; transcript: TranscriptEntry }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(sessionId);
        if (call) {
          next.set(sessionId, {
            ...call,
            transcripts: [...call.transcripts, transcript],
            language: transcript.language || call.language,
          });
        }
        return next;
      });
    });

    socket.on('emotion_update', ({ sessionId, emotion, priority }: {
      sessionId: string;
      emotion: EmotionData;
      priority: PriorityData;
    }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(sessionId);
        if (call) {
          next.set(sessionId, {
            ...call,
            latestEmotion: emotion,
            latestPriority: priority,
            priority: priority.level,
            emotionHistory: [
              ...call.emotionHistory,
              {
                emotion: emotion.primaryEmotion,
                score: emotion.emotionScore,
                urgency: emotion.urgencyScore,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
        return next;
      });
    });

    socket.on('analysis_ready', (data: {
      sessionId: string;
      summary: string;
      keywords: string[];
      priority: string;
      transcripts: TranscriptEntry[];
      session?: { agentType?: string };
    }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(data.sessionId);
        if (call) {
          next.set(data.sessionId, {
            ...call,
            summary: data.summary,
            keywords: data.keywords,
            transcripts: data.transcripts,
            agentType: (data.session?.agentType as ActiveCall['agentType']) || call.agentType,
          });
        }
        return next;
      });
    });

    socket.on('escalation_alert', (data: { sessionId: string; reason: string; priority: string; agentType?: string }) => {
      setEscalationAlerts((prev) => [...prev, data.sessionId]);
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(data.sessionId);
        if (call) {
          next.set(data.sessionId, {
            ...call,
            status: 'escalated',
            agentType: (data.agentType as ActiveCall['agentType']) || call.agentType,
          });
        }
        return next;
      });
      setSelectedSessionId(data.sessionId);
    });

    socket.on('location_updated', ({ sessionId, location }: { sessionId: string; location: any }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(sessionId);
        if (call) next.set(sessionId, { ...call, location });
        return next;
      });
    });

    socket.on('takeover_confirmed', ({ session }: { session: ActiveCall }) => {
      setTakenOverSessions((prev) => new Set([...prev, session.sessionId]));
    });

    socket.on('citizen_disconnected', ({ sessionId }: { sessionId: string }) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        const call = next.get(sessionId);
        if (call) next.set(sessionId, { ...call, status: 'closed' });
        return next;
      });
      // Stop mic if it was active for this session
      setAgentMicActive((prev) => (prev === sessionId ? null : prev));
    });

    return () => {
      socket.off('active_sessions');
      socket.off('new_call');
      socket.off('live_transcript');
      socket.off('emotion_update');
      socket.off('analysis_ready');
      socket.off('escalation_alert');
      socket.off('location_updated');
      socket.off('takeover_confirmed');
      socket.off('citizen_disconnected');
    };
  }, []);

  const takeoverCall = useCallback((sessionId: string) => {
    const socket = getSocket();
    socket.emit('agent_takeover', { sessionId });
    setEscalationAlerts((prev) => prev.filter((id) => id !== sessionId));
  }, []);

  // ── Agent live mic ────────────────────────────────────────────────────────
  // Push-to-talk: hold mic button → streams audio → backend STTs it → TTS to citizen
  const toggleAgentMic = useCallback(async (sessionId: string) => {
    const socket = getSocket();

    // If already recording for this session → stop
    if (agentMediaRecorderRef.current && agentMicActive === sessionId) {
      agentMediaRecorderRef.current.stop();
      return;
    }

    // Stop any other active recording first
    if (agentMediaRecorderRef.current) {
      agentMediaRecorderRef.current.stop();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      agentMediaRecorderRef.current = recorder;

      const localChunks: ArrayBuffer[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          event.data.arrayBuffer().then((buf) => localChunks.push(buf));
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        agentMediaRecorderRef.current = null;
        setAgentMicActive(null);

        // Wait for any in-flight arrayBuffer() promises
        await new Promise((r) => setTimeout(r, 100));

        for (const buf of localChunks) {
          socket.emit('agent_audio_chunk', { chunk: buf, sessionId });
        }
        await new Promise((r) => setTimeout(r, 50));
        socket.emit('agent_audio_end', { sessionId, mimeType });
      };

      recorder.start(500);
      setAgentMicActive(sessionId);
    } catch (err) {
      console.error('Agent mic error:', err);
      setAgentMicActive(null);
    }
  }, [agentMicActive]);

  // Legacy text message — kept for backward compat but no longer shown in UI
  const sendAgentMessage = useCallback((sessionId: string, message: string, language: string) => {
    const socket = getSocket();
    socket.emit('agent_message', { sessionId, message, language });
  }, []);

  const overrideInterpretation = useCallback((
    sessionId: string,
    correctedInterpretation: string,
    correctedSentiment: string,
  ) => {
    const socket = getSocket();
    socket.emit('agent_override_interpretation', {
      sessionId,
      correctedInterpretation,
      correctedSentiment,
    });
  }, []);

  const dismissAlert = useCallback((sessionId: string) => {
    setEscalationAlerts((prev) => prev.filter((id) => id !== sessionId));
  }, []);

  const selectedCall = selectedSessionId ? activeCalls.get(selectedSessionId) : null;

  return {
    activeCalls: Array.from(activeCalls.values()),
    selectedCall,
    selectedSessionId,
    escalationAlerts,
    takenOverSessions,
    agentMicActive,
    setSelectedSessionId,
    takeoverCall,
    toggleAgentMic,
    sendAgentMessage,
    overrideInterpretation,
    dismissAlert,
  };
}
