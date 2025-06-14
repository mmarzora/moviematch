import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db } from './firebase';
import { collection, getDocs, enableNetwork, disableNetwork } from 'firebase/firestore';
import SessionManager from './components/SessionManager';
import MovieMatching from './components/MovieMatching';
import SmartMovieMatching from './components/SmartMovieMatching';
import { Session, sessionService } from './services/sessionService';
import { v4 as uuidv4 } from 'uuid';
import { API_BASE_URL } from './config';
import GettingStartedInfo from './components/GettingStartedInfo';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [useSmartMatching, setUseSmartMatching] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  // Always generate a fresh user ID for each app session
  const [memberId] = useState<string>(() => uuidv4());

  // Ref to store unsubscribe function for Firestore listener
  const unsubscribeRef = useRef<null | (() => void)>(null);

  // Test and manage Firebase connection
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;

    const testFirebase = async () => {
      try {
        setIsConnecting(true);
        console.log('Testing Firebase connection...');
        await enableNetwork(db);
        const testCollection = collection(db, 'sessions');
        await getDocs(testCollection);
        console.log('Firebase connection successful');
        setFirebaseError(null);
        setIsConnecting(false);
      } catch (error: any) {
        console.error('Firebase connection error:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying connection (attempt ${retryCount}/${maxRetries})...`);
          await disableNetwork(db);
          setTimeout(testFirebase, 2000);
        } else {
          setFirebaseError(`Failed to connect to Firebase: ${error.message}`);
          setIsConnecting(false);
        }
      }
    };

    testFirebase();
    return () => {
      disableNetwork(db).catch(console.error);
    };
  }, []);

  // Real-time Firestore session listener - Optimized to prevent duplicates
  useEffect(() => {
    // Clean up previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // Only set up listener if we have a session and don't already have one
    if (session?.code && !unsubscribeRef.current) {
      unsubscribeRef.current = sessionService.subscribeToSession(session.code, (updatedSession) => {
        if (updatedSession) {
          // Only update if session data actually changed
          setSession(prevSession => {
            if (JSON.stringify(prevSession) !== JSON.stringify(updatedSession)) {
              return updatedSession;
            }
            return prevSession;
          });
        }
      });
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [session?.code]); // Only depend on session code, not entire session object

  // Log the backend API URL on app startup
  useEffect(() => {
    console.log('[MovieMatch] Using backend API URL:', API_BASE_URL);
  }, []);

  const handleSessionStart = (newSession: Session, smartMatchingEnabled: boolean) => {
    console.log('Session started:', newSession, 'Smart matching:', smartMatchingEnabled);
    setSession(newSession);
    setUseSmartMatching(smartMatchingEnabled);
  };

  if (isConnecting) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>MovieMatch</h1>
        </header>
        <main>
          <div className="loading">
            <p>Connecting to server...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>MovieMatch</h1>
        {session && (
          <div className="app-status">
            {useSmartMatching ? (
              <span className="smart-badge">🧠 Smart Algorithm</span>
            ) : (
              <span className="random-badge">🎲 Random Selection</span>
            )}
          </div>
        )}
      </header>
      <main>
        {firebaseError ? (
          <div className="error-message">
            <p>{firebaseError}</p>
            <button onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        ) : !session ? (
          <>
            <GettingStartedInfo />
            <SessionManager onSessionStart={handleSessionStart} memberId={memberId} />
          </>
        ) : (
          <div className="session-active">
            <div className="session-info">
              <h2>Session Code: {session.code}</h2>
              <p>Share this code with your movie partner!</p>
              {useSmartMatching && (
                <p className="smart-info">
                  ✨ Using personalized recommendations that learn your preferences
                </p>
              )}
            </div>
            {useSmartMatching ? (
              <SmartMovieMatching session={session} memberId={memberId} />
            ) : (
              <MovieMatching session={session} memberId={memberId} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
