import React, { useState } from 'react';

interface SessionJoinProps {
  onSessionJoined: (sessionId: string) => void;
  memberId: string;
}

const SessionJoin: React.FC<SessionJoinProps> = ({ onSessionJoined, memberId }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter a session code');
      return;
    }

    console.log('[SessionJoin:DEBUG] Join button clicked:', {
      code: code.trim(),
      memberId,
      timestamp: new Date().toISOString()
    });

    setIsLoading(true);
    setError(null);

    try {
      // Just validate the code format and pass it to the parent
      const trimmedCode = code.trim();
      if (!/^\d{6}$/.test(trimmedCode)) {
        throw new Error('Invalid session code format. Please enter a 6-digit code.');
      }

      onSessionJoined(trimmedCode);
    } catch (err: any) {
      console.error('[SessionJoin:DEBUG] Error:', {
        code: code.trim(),
        memberId,
        error: err,
        timestamp: new Date().toISOString()
      });
      setError(err.message || 'Failed to join session. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="session-join">
      <h2>Join Session</h2>
      <form onSubmit={handleJoinSession}>
        <input
          type="text"
          value={code}
          onChange={(e) => {
            const newCode = e.target.value.trim();
            console.log('[SessionJoin:DEBUG] Code input changed:', {
              newCode,
              memberId,
              timestamp: new Date().toISOString()
            });
            setCode(newCode);
          }}
          placeholder="Enter 6-digit code"
          maxLength={6}
          className="code-input"
          disabled={isLoading}
        />
        <button 
          type="submit"
          disabled={isLoading}
          className="join-button"
        >
          {isLoading ? 'Joining...' : 'Join Session'}
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
};

export default SessionJoin; 