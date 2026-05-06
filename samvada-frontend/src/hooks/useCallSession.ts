import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '../services/socket';

export type CallStatus =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'processing'
  | 'verifying'
  | 'escalated'
  | 'ended';

export interface AIResponse {
  text: string;
  audio?: string;           // base64 audio (WAV for English, MP3 for Hindi/Kannada)
  audioMimeType?: string;   // 'audio/wav' or 'audio/mpeg'
  language: string;
  requiresConfirmation?: boolean;
  verificationDecision?: string;
  useBrowserTTS?: boolean;
}

// BCP-47 tags for browser TTS fallback
const LANG_BCP47: Record<string, string> = {
  kn: 'kn-IN', kannada: 'kn-IN',
  hi: 'hi-IN', hindi:   'hi-IN',
  en: 'en-IN', english: 'en-IN',
};

export function useCallSession() {
  const [callStatus, setCallStatus]       = useState<CallStatus>('idle');
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [aiResponse, setAiResponse]       = useState<AIResponse | null>(null);
  const [isEscalated, setIsEscalated]     = useState(false);
  const [escalationMessage, setEscalationMessage] = useState('');
  const [sttRetryMessage, setSttRetryMessage]     = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Browser TTS fallback (used only when server audio is absent) ────────
  const speakWithBrowser = useCallback((text: string, language: string) => {
    // Stop any server audio that might be playing first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang   = LANG_BCP47[language] ?? 'en-IN';
    utt.rate   = 0.9;
    utt.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.lang.toLowerCase().startsWith(utt.lang.slice(0, 2)));
    if (match) utt.voice = match;
    utt.onerror = (e) => console.error('SpeechSynthesis error:', e);
    window.speechSynthesis.speak(utt);
  }, []);

  // ── Play server audio from base64 (WAV for English, MP3 for Hindi/Kannada)
  const playAudio = useCallback((base64Audio: string, mimeType = 'audio/mpeg') => {
    try {
      // Stop browser TTS immediately — server audio takes priority
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();

      // Stop any previously playing server audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }

      const binary = atob(base64Audio);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = (e) => { console.error('Audio error:', e); audioRef.current = null; };
      audio.play().catch(e => console.warn('Autoplay blocked:', e));
    } catch (e) {
      console.error('Audio setup failed:', e);
    }
  }, []);

  // ── Unified speak — server audio always wins, browser TTS only as fallback
  const speak = useCallback((response: AIResponse) => {
    if (response.audio) {
      // Server audio present — playAudio already cancels browser TTS internally
      playAudio(response.audio, response.audioMimeType ?? 'audio/mpeg');
    } else {
      // No server audio — use browser TTS as fallback only
      speakWithBrowser(response.text, response.language);
    }
  }, [playAudio, speakWithBrowser]);

  useEffect(() => {
    // Pre-load browser voices (async on first call)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    const socket = getSocket();

    socket.on('call_started', ({ sessionId: sid }: { sessionId: string }) => {
      setSessionId(sid);
      setCallStatus('active');
    });

    socket.on('processing', ({ status }: { status: string }) => {
      setCallStatus('processing');
      setProcessingStatus(status);
    });

    socket.on('ai_response', (response: AIResponse) => {
      setAiResponse(response);
      setCallStatus(response.requiresConfirmation ? 'verifying' : 'active');
      setProcessingStatus('');
      speak(response);
    });

    socket.on('escalate_to_agent', ({ message }: { message: string }) => {
      setIsEscalated(true);
      setEscalationMessage(message);
      setCallStatus('escalated');
    });

    socket.on('agent_connected', ({ message }: { message: string }) => {
      setEscalationMessage(message);
    });

    socket.on('agent_voice', ({ text, audio, language, audioMimeType }: { text?: string; audio?: string; language?: string; audioMimeType?: string }) => {
      // Agent live mic: raw audio forwarded directly — play it immediately, no TTS needed
      if (audio) {
        playAudio(audio, audioMimeType ?? 'audio/webm');
      } else if (text) {
        // Legacy text-only path (kept for safety)
        const resp: AIResponse = { text, language: language ?? 'en' };
        setAiResponse(resp);
        speakWithBrowser(text, language ?? 'en');
      }
    });

    socket.on('stt_retry', ({ message }: { message: string }) => {
      setSttRetryMessage(message);
      setCallStatus('active');
      setProcessingStatus('');
      speakWithBrowser(message, 'en');
      setTimeout(() => setSttRetryMessage(''), 4000);
    });

    socket.on('re_verify', ({ message }: { message: string }) => {
      setCallStatus('verifying');
      const resp: AIResponse = { text: message, language: 'en', requiresConfirmation: true };
      setAiResponse(resp);
      speak(resp);
    });

    socket.on('verification_confirmed', () => setCallStatus('active'));

    socket.on('pipeline_error', ({ message }: { message: string }) => {
      setProcessingStatus('');
      setCallStatus('active');
      console.error('Pipeline error:', message);
    });

    return () => {
      socket.off('call_started');
      socket.off('processing');
      socket.off('ai_response');
      socket.off('escalate_to_agent');
      socket.off('agent_connected');
      socket.off('agent_voice');
      socket.off('stt_retry');
      socket.off('re_verify');
      socket.off('verification_confirmed');
      socket.off('pipeline_error');
    };
  }, [speak, speakWithBrowser, playAudio]);

  const startCall = useCallback(() => {
    setCallStatus('connecting');
    const socket = getSocket();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => socket.emit('start_call', { location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        ()    => socket.emit('start_call', {}),
      );
    } else {
      socket.emit('start_call', {});
    }
  }, []);

  const endCall = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    window.speechSynthesis?.cancel();
    disconnectSocket();
    setCallStatus('ended');
    setSessionId(null);
    setAiResponse(null);
    setIsEscalated(false);
  }, []);

  const sendVerificationFeedback = useCallback(
    (feedback: 'correct' | 'partial' | 'incorrect') => {
      if (!sessionId) return;
      getSocket().emit('verification_feedback', { sessionId, feedback });
      setCallStatus('processing');
    },
    [sessionId],
  );

  return {
    callStatus, sessionId, processingStatus, aiResponse,
    isEscalated, escalationMessage, sttRetryMessage,
    startCall, endCall, sendVerificationFeedback, playAudio, speakWithBrowser,
  };
}
