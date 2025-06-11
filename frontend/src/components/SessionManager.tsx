import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import SessionCreate from './SessionCreate';
import SessionJoin from './SessionJoin';
import { sessionService, Session } from '../services/sessionService';
import { matchingService } from '../services/matchingService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface SessionManagerProps {
  onSessionStart: (session: Session, useSmartMatching: boolean) => void;
  memberId: string;
}

const SessionManager: React.FC<SessionManagerProps> = ({ onSessionStart, memberId }) => {
  // Use the memberId passed from App.tsx instead of generating our own
  const memberIdRef = useRef<string>(memberId);
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [useSmartMatching, setUseSmartMatching] = useState(true);
  const [algorithmAvailable, setAlgorithmAvailable] = useState<boolean | null>(null);

  // Check algorithm availability on mount
  useEffect(() => {
    const checkAlgorithm = async () => {
      try {
        await matchingService.healthCheck();
        setAlgorithmAvailable(true);
      } catch (error) {
        console.warn('MovieMatch algorithm not available:', error);
        setAlgorithmAvailable(false);
        setUseSmartMatching(false);
      }
    };
    
    checkAlgorithm();
  }, []);

  const handleSessionUpdate = useCallback((updatedSession: Session | null) => {
    console.log('[SessionManager] Firestore update received:', updatedSession);
    if (updatedSession) {
      // Only update current session state without triggering onSessionStart
      setCurrentSession(prevSession => {
        // Deep comparison to avoid unnecessary updates
        if (JSON.stringify(prevSession) !== JSON.stringify(updatedSession)) {
          // Update smart matching state from Firebase
          setUseSmartMatching(updatedSession.useSmartMatching);
          return updatedSession;
        }
        return prevSession;
      });
      setSessionCode(updatedSession.code);
      
      // Only call onSessionStart when we have 2 members (session is ready to start)
      const wasSessionReady = currentSession?.members.length === 2;
      const isSessionNowReady = updatedSession.members.length === 2;
      
      // Start the session only when it becomes ready (transitions from not ready to ready)
      if (!wasSessionReady && isSessionNowReady) {
        console.log('[SessionManager] Session now ready with 2 members, starting session');
        onSessionStart(updatedSession, updatedSession.useSmartMatching);
      }
    }
  }, [onSessionStart, currentSession]);

  useEffect(() => {
    if (!sessionId || !memberIdRef.current) return;
    return sessionService.subscribeToSession(sessionId, handleSessionUpdate);
  }, [sessionId, handleSessionUpdate]);

  const handleSessionCreated = useCallback(async (id: string, code: string) => {
    setSessionId(id);
    setSessionCode(code);
    
    try {
      const session = await sessionService.joinSession(code, memberIdRef.current);
      handleSessionUpdate(session);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, [handleSessionUpdate]);

  const handleSessionJoined = useCallback(async (id: string) => {
    if (sessionId === id) return;

    setSessionId(id);
    
    try {
      const session = await sessionService.joinSession(id, memberIdRef.current);
      handleSessionUpdate(session);
    } catch (error) {
      console.error('Failed to join session:', error);
      setSessionId(null);
      setSessionCode(null);
      setCurrentSession(null);
    }
  }, [sessionId, handleSessionUpdate]);

  const handleManualRefresh = useCallback(async () => {
    if (!sessionId) return;

    setIsRefreshing(true);
    try {
      const session = await sessionService.joinSession(sessionId, memberIdRef.current);
      handleSessionUpdate(session);
    } catch (err) {
      console.error('Manual refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId, handleSessionUpdate]);

  const handleSmartMatchingToggle = useCallback((enabled: boolean) => {
    setUseSmartMatching(enabled);
    if (currentSession) {
      // Update Firebase with new smart matching state
      const sessionRef = doc(db, 'sessions', currentSession.code);
      updateDoc(sessionRef, { useSmartMatching: enabled });
      onSessionStart(currentSession, enabled);
    }
  }, [currentSession, onSessionStart]);

  const otherMemberId = useMemo(() => 
    currentSession?.members.find(id => id !== memberIdRef.current),
    [currentSession?.members]
  );

  const isSessionReady = useMemo(() => 
    currentSession?.members.length === 2,
    [currentSession?.members.length]
  );

  const sessionStyles = useMemo(() => ({
    container: {
      display: 'flex', 
      flexDirection: 'column' as const,
      gap: '10px',
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      position: 'relative' as const
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    code: {
      fontSize: '24px', 
      fontWeight: 'bold' as const,
      margin: '10px 0'
    },
    refreshButton: {
      padding: '10px 20px',
      backgroundColor: '#4a90e2',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: isRefreshing ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      opacity: isRefreshing ? 0.7 : 1,
      transition: 'all 0.2s ease',
      fontSize: '16px',
      fontWeight: 'bold' as const,
      zIndex: 1000
    },
    smartMatchingSection: {
      background: algorithmAvailable ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#6c757d',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      marginTop: '15px'
    },
    toggleContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px'
    },
    toggle: {
      position: 'relative' as const,
      display: 'inline-block',
      width: '60px',
      height: '34px'
    },
    toggleInput: {
      opacity: 0,
      width: 0,
      height: 0
    },
    slider: {
      position: 'absolute' as const,
      cursor: algorithmAvailable ? 'pointer' : 'not-allowed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: algorithmAvailable && useSmartMatching ? '#4CAF50' : '#ccc',
      transition: '0.4s',
      borderRadius: '34px',
      opacity: algorithmAvailable ? 1 : 0.5
    },
    sliderButton: {
      position: 'absolute' as const,
      content: '""',
      height: '26px',
      width: '26px',
      left: useSmartMatching && algorithmAvailable ? '30px' : '4px',
      bottom: '4px',
      backgroundColor: 'white',
      transition: '0.4s',
      borderRadius: '50%'
    }
  }), [isRefreshing, algorithmAvailable, useSmartMatching]);

  if (!sessionCode) {
    return (
      <>
        <SessionCreate 
          onSessionCreated={handleSessionCreated} 
          userId={memberIdRef.current}
        />
        <div className="divider">or</div>
        <SessionJoin 
          onSessionJoined={handleSessionJoined}
          memberId={memberIdRef.current}
        />
      </>
    );
  }

  return (
    <div className="session-manager">
      <div className="session-code">
        <div style={sessionStyles.container}>
          <div style={sessionStyles.header}>
            <h2 style={{ margin: 0 }}>Your Session Code</h2>
            <button 
              onClick={handleManualRefresh}
              className="refresh-button"
              disabled={isRefreshing}
              style={sessionStyles.refreshButton}
            >
              <span style={{ 
                display: 'inline-block',
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
              }}>
                🔄
              </span>
              {isRefreshing ? 'Refreshing...' : 'Refresh Session'}
            </button>
          </div>
          <p className="code" style={sessionStyles.code}>{sessionCode}</p>
          <p style={{ margin: 0 }}>Share this code with your movie partner!</p>
          
          {/* Smart Matching Toggle */}
          <div style={sessionStyles.smartMatchingSection}>
            <div style={sessionStyles.toggleContainer}>
              <div>
                <h4 style={{ margin: '0 0 5px 0' }}>🧠 Smart Matching Algorithm</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
                  {algorithmAvailable === null && 'Checking availability...'}
                  {algorithmAvailable === false && 'Algorithm unavailable - using random movies'}
                  {algorithmAvailable === true && (useSmartMatching 
                    ? 'Personalized recommendations enabled' 
                    : 'Using random movie selection')}
                </p>
              </div>
              {algorithmAvailable && (
                <label style={sessionStyles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={useSmartMatching}
                    onChange={(e) => handleSmartMatchingToggle(e.target.checked)}
                    style={sessionStyles.toggleInput}
                  />
                  <span style={{...sessionStyles.slider}}>
                    <span style={sessionStyles.sliderButton}></span>
                  </span>
                </label>
              )}
            </div>
            {algorithmAvailable && useSmartMatching && (
              <small style={{ opacity: 0.8 }}>
                ✨ Algorithm learns your preferences and finds better matches over time
              </small>
            )}
          </div>
        </div>
        {currentSession && (
          <div className="session-status" style={{ position: 'relative' }}>
            <p className="members-count">
              Members in session: {currentSession.members.length}/2
            </p>
            <p className="member-id">
              Your ID: {memberIdRef.current.slice(0, 8)}...
            </p>
            {isSessionReady ? (
              <p className="other-member">
                Paired with: {otherMemberId?.slice(0, 8)}...
              </p>
            ) : (
              <p className="waiting-message">Waiting for partner to join...</p>
            )}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .session-manager {
            position: relative;
          }
          .refresh-button:hover {
            background-color: #357abd !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
        `}
      </style>
    </div>
  );
};

export default React.memo(SessionManager); 