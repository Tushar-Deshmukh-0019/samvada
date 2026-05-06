# Audio Playback Implementation

## Overview
Implemented full audio recording storage and playback for both citizen and AI transcripts on the agent dashboard.

## What Was Added

### Backend

#### 1. **AudioStore Service** (`samvada-backend/src/audio/audio.store.ts`)
- In-memory store for audio buffers keyed by transcript ID
- Stores both citizen recordings and AI TTS responses
- Bounded to 500 entries with FIFO eviction to prevent memory growth
- Stores buffer + MIME type for each audio entry

#### 2. **AudioController** (`samvada-backend/src/audio/audio.controller.ts`)
- REST endpoint: `GET /audio/:id`
- Streams audio buffers with correct MIME type
- CORS-enabled for agent dashboard access
- Returns 404 for missing audio

#### 3. **AudioModule** (`samvada-backend/src/audio/audio.module.ts`)
- Exports AudioStore for use in WebSocket gateway
- Registers AudioController for REST endpoint

#### 4. **WebSocket Gateway Updates** (`samvada-backend/src/websocket/websocket.gateway.ts`)
- Injects AudioStore
- **Citizen audio**: Stores raw audio buffer when processing pipeline runs
  - Saves with transcript ID as key
  - MIME type from client (webm/mp4)
  - Emits `/audio/:id` URL to agent dashboard
- **AI audio**: Stores TTS audio buffer in `sendAiResponse()`
  - Saves Groq Orpheus (WAV) or Google TTS (MP3) output
  - Emits `/audio/:id` URL to agent dashboard
- **Agent messages**: Stores agent voice message TTS audio
  - Same pattern as AI responses

### Frontend

#### 5. **TranscriptPanel Updates** (`samvada-frontend/src/components/agent/TranscriptPanel.tsx`)
- **Play button functionality**:
  - Citizen transcripts: plays original mic recording
  - AI transcripts: plays exact TTS audio sent to citizen
  - Shows "Play" when idle, "Stop" when playing
  - Visual active state (blue highlight)
  - Only one audio plays at a time (stops previous)
- **Bilingual display**:
  - Always shows original language text with language tag
  - Shows English translation below (when different from original)
  - English text is muted/italic to distinguish from original
  - Language tags color-coded (blue for English)
- **Audio URL resolution**: Resolves relative `/audio/:id` to `http://localhost:3000/audio/:id`

#### 6. **CSS Updates** (`samvada-frontend/src/App.css`)
- `.play-btn-active`: Blue highlight for playing state
- `.transcript-text-row`: Flex layout for text + language tag
- `.transcript-text-muted`: Muted style for English translations

## Data Flow

### Citizen Audio
```
1. Citizen speaks → MediaRecorder captures chunks
2. Frontend sends chunks via audio_chunk events
3. Backend concatenates chunks into Buffer
4. STT processes audio → transcription
5. Backend stores audio: audioStore.save(transcriptId, audioBuffer, mimeType)
6. Backend emits transcript with audioUrl: `/audio/${transcriptId}`
7. Agent clicks Play → frontend fetches GET /audio/:id
8. AudioController streams buffer → frontend plays
```

### AI Audio
```
1. Backend generates TTS (Groq Orpheus or Google TTS)
2. Backend stores audio: audioStore.save(transcriptId, ttsBuffer, mimeType)
3. Backend emits transcript with audioUrl: `/audio/${transcriptId}`
4. Backend sends base64 audio to citizen (for immediate playback)
5. Agent clicks Play → frontend fetches GET /audio/:id
6. AudioController streams buffer → frontend plays
```

## Technical Details

### Audio Storage
- **Citizen**: WebM (Opus) or MP4 from MediaRecorder
- **AI (English)**: WAV from Groq Orpheus
- **AI (Hindi/Kannada)**: MP3 from Google TTS
- **Max entries**: 500 (oldest evicted when exceeded)
- **Persistence**: In-memory only (lost on restart)

### MIME Types
- `audio/webm` or `audio/mp4` for citizen recordings
- `audio/wav` for Groq Orpheus TTS
- `audio/mpeg` for Google TTS

### Frontend Audio Playback
- Uses HTML5 Audio API
- Stops previous audio when starting new playback
- Cleanup on component unmount
- Error handling for network failures

## Verification

Both backend and frontend compile cleanly:
- Backend: `tsc --noEmit` ✅
- Frontend: `tsc --noEmit` ✅

## What's Now Working

✅ **Citizen transcripts**: Agent can replay the exact audio the citizen spoke
✅ **AI transcripts**: Agent can replay the exact TTS response the citizen heard
✅ **Bilingual display**: Original language + English translation shown side-by-side
✅ **Play/Stop UI**: Visual feedback for which audio is playing
✅ **Audio storage**: Bounded in-memory store with automatic eviction
✅ **REST endpoint**: Clean HTTP API for audio retrieval

## Future Enhancements (Optional)

- Persist audio to disk or cloud storage (S3, etc.)
- Add waveform visualization
- Add playback speed controls
- Add download button for audio files
- Add audio compression to reduce memory usage
