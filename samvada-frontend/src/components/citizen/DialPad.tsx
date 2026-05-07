import { useState } from 'react';
import { Phone, Delete } from 'lucide-react';

interface DialPadProps {
  onCall: (number: string) => void;
}

const BUTTONS: { main: string; sub: string }[][] = [
  [{ main: '1', sub: '' },    { main: '2', sub: 'ABC' }, { main: '3', sub: 'DEF' }],
  [{ main: '4', sub: 'GHI' }, { main: '5', sub: 'JKL' }, { main: '6', sub: 'MNO' }],
  [{ main: '7', sub: 'PQRS'},{ main: '8', sub: 'TUV' }, { main: '9', sub: 'WXYZ'}],
  [{ main: '*', sub: '' },    { main: '0', sub: '+' },   { main: '#', sub: '' }],
];

export function DialPad({ onCall }: DialPadProps) {
  const [input, setInput] = useState('');

  const handlePress = (val: string) => {
    setInput((prev) => (prev.length < 10 ? prev + val : prev));
  };

  const handleCall = () => {
    if (input.length > 0) {
      onCall(input);
    }
  };

  const handleDelete = () => setInput((prev) => prev.slice(0, -1));

  return (
    <div className="dialpad-container">
      <div className="dialpad-header">
        <span 
          className="logo-text" 
          onClick={() => window.location.href = '/agent'}
          style={{ cursor: 'pointer' }}
          title="Go to Agent Dashboard"
        >
          Samvada
        </span>
        <span className="logo-sub">1092 Helpline</span>
      </div>

      <div className="dialpad-display">
        <span className="dialpad-number">{input || ''}</span>
        {input && (
          <button className="delete-btn" onClick={handleDelete} aria-label="Delete">
            <Delete size={22} />
          </button>
        )}
      </div>

      {!input && (
        <div className="dialpad-hint">
          Enter <strong>1092</strong> to connect to helpline
        </div>
      )}
      {input && <div style={{ height: 20 }} />}

      <div className="dialpad-grid">
        {BUTTONS.map((row, ri) => (
          <div key={ri} className="dialpad-row">
            {row.map((btn) => (
              <button
                key={btn.main}
                className="dialpad-btn"
                onClick={() => handlePress(btn.main)}
                aria-label={btn.main}
              >
                <span className="btn-main">{btn.main}</span>
                {btn.sub && <span className="btn-sub">{btn.sub}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom row: call button centered */}
      <div className="dialpad-bottom-row">
        <button
          className={`call-btn ${input === '1092' ? 'call-btn-ready' : ''}`}
          onClick={handleCall}
          disabled={input.length === 0}
          aria-label="Call"
        >
          <Phone size={28} color="white" />
          <span>Call</span>
        </button>
      </div>
    </div>
  );
}
