
import { DialPad } from '../components/citizen/DialPad';
import { CallScreen } from '../components/citizen/CallScreen';
import { useCallSession } from '../hooks/useCallSession';

export function CitizenPage() {
  const {
    callStatus,
    sessionId,
    processingStatus,
    aiResponse,
    isEscalated,
    escalationMessage,
    sttRetryMessage,
    startCall,
    endCall,
    sendVerificationFeedback,
  } = useCallSession();

  const handleCall = (number: string) => {
    if (number === '1092' || number.length > 0) {
      startCall();
    }
  };

  if (callStatus === 'idle' || callStatus === 'ended') {
    return (
      <div className="citizen-page">
        <DialPad onCall={handleCall} />
      </div>
    );
  }

  return (
    <div className="citizen-page">
      <CallScreen
        callStatus={callStatus}
        sessionId={sessionId}
        processingStatus={processingStatus}
        aiResponse={aiResponse}
        isEscalated={isEscalated}
        escalationMessage={escalationMessage}
        sttRetryMessage={sttRetryMessage}
        onEndCall={endCall}
        onVerificationFeedback={sendVerificationFeedback}
      />
    </div>
  );
}
