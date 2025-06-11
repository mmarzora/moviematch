import React, { useState } from 'react';
import { sessionService } from '../services/sessionService';

interface SessionCreateProps {
  onSessionCreated: (sessionId: string, code: string) => void;
  userId: string;
}

const SessionCreate: React.FC<SessionCreateProps> = ({ onSessionCreated, userId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log('SessionCreate rendered, isLoading:', isLoading);

  const handleCreateSession = async () => {
    console.log('Button clicked - handleCreateSession called');
    if (isLoading) {
      console.log('Already loading, ignoring click');
      return;
    }

    try {
      setIsLoading(true);
      console.log('Set loading to true');
      setError(null);

      console.log('About to call sessionService.createSession()');
      const session = await sessionService.createSession(userId);
      console.log('Session created:', session);
      
      onSessionCreated(session.id, session.code);
      console.log('onSessionCreated callback called');
    } catch (err) {
      console.error('Error in handleCreateSession:', err);
      setError('Failed to create session. Please try again.');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    console.log('Button clicked');
    handleCreateSession();
  };

  return (
    <div className="session-create">
      <h2>Create New Session</h2>
      <button 
        onClick={handleClick}
        disabled={isLoading}
        className="create-button"
      >
        {isLoading ? 'Creating...' : 'Create New Session'}
      </button>
      {error && <p className="error-message">{error}</p>}
      {isLoading && <p>Loading state is true</p>}
    </div>
  );
};

export default SessionCreate; 