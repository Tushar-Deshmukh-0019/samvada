import { useRef, useState, useCallback } from 'react';
import { getSocket } from '../services/socket';

interface UseAudioRecorderOptions {
  sessionId: string | null;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

export function useAudioRecorder({ sessionId, onRecordingStart, onRecordingStop }: UseAudioRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isRecordingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    if (!sessionId) return;
    if (isRecordingRef.current) return;
    setError(null);

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
      mediaRecorderRef.current = recorder;

      const socket = getSocket();

      // Collect ALL chunks into a local array first
      // Only send to backend after stop() so we guarantee ordering:
      // all audio_chunk events arrive BEFORE audio_end
      const localChunks: ArrayBuffer[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // Convert to ArrayBuffer synchronously-ish and store locally
          event.data.arrayBuffer().then((buf) => {
            localChunks.push(buf);
          });
        }
      };

      recorder.onstop = async () => {
        // Stop mic tracks
        stream.getTracks().forEach((t) => t.stop());

        // Wait a tick to let any in-flight arrayBuffer() promises resolve
        await new Promise((r) => setTimeout(r, 100));

        // Now send all chunks in order, then signal end
        for (const buf of localChunks) {
          socket.emit('audio_chunk', { chunk: buf, sessionId });
        }

        // Small delay to ensure socket sends are flushed before audio_end
        await new Promise((r) => setTimeout(r, 50));

        socket.emit('audio_end', { sessionId, mimeType });

        isRecordingRef.current = false;
        setIsRecording(false);
        onRecordingStop?.();
      };

      recorder.start(500); // 500ms chunks — fewer, larger chunks = more reliable
      isRecordingRef.current = true;
      setIsRecording(true);
      onRecordingStart?.();
    } catch (err: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setError(err.message || 'Microphone access denied');
    }
  }, [sessionId, onRecordingStart, onRecordingStop]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  return { isRecording, startRecording, stopRecording, toggleRecording, error };
}
