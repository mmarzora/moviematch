import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  Timestamp,
  runTransaction
} from 'firebase/firestore';
import { generateSessionCode } from '../utils/sessionUtils';

export interface UserSwipeHistory {
  movieId: number;
  decision: boolean;
  timestamp: number;
}

export interface Session {
  id: string;
  code: string;
  created: Timestamp;
  active: boolean;
  members: string[];
  currentMovieId: number | null;
  viewedMovies: number[];
  swipes: {
    [movieId: string]: {
      [memberId: string]: boolean;
    };
  };
  matches: number[];
  userHistory: {
    [memberId: string]: UserSwipeHistory[];
  };
  matchingSessionId?: string; // For shared algorithm session across browsers
  useSmartMatching: boolean; // Flag to indicate if smart matching is enabled
}

export const sessionService = {
  // Create a new session
  createSession: async (creatorId: string): Promise<Session> => {
    try {
      const code = generateSessionCode();
      const sessionRef = doc(db, 'sessions', code);
      const sessionData: Session = {
        id: code,
        code,
        created: serverTimestamp() as Timestamp,
        active: true,
        members: [creatorId],
        currentMovieId: null,
        viewedMovies: [],
        swipes: {},
        matches: [],
        userHistory: {
          [creatorId]: []
        },
        useSmartMatching: true // Default to true for new sessions
      };

      await setDoc(sessionRef, sessionData);
      return sessionData;
    } catch (error: any) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  },

  // Join an existing session
  joinSession: async (code: string, memberId: string): Promise<Session> => {
    const sessionRef = doc(db, 'sessions', code);
    const snapshot = await getDoc(sessionRef);
    
    if (!snapshot.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = snapshot.data() as Session;
    
    if (!sessionData.active) {
      throw new Error('Session is no longer active');
    }

    if (sessionData.members.length >= 2) {
      throw new Error('Session is full');
    }

    if (sessionData.members.includes(memberId)) {
      return sessionData;
    }

    // Initialize user history for new member
    const userHistory = {
      ...sessionData.userHistory,
      [memberId]: []
    };

    await updateDoc(sessionRef, {
      members: arrayUnion(memberId),
      userHistory
    });

    const updatedSnapshot = await getDoc(sessionRef);
    return updatedSnapshot.data() as Session;
  },

  // Listen to session changes
  subscribeToSession: (sessionId: string, callback: (session: Session | null) => void) => {
    const sessionRef = doc(db, 'sessions', sessionId);
    
    return onSnapshot(
      sessionRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        const data = snapshot.data() as Session;
        callback(data);
      },
      () => callback(null)
    );
  },

  // Update movie swipe with independent progression
  updateMovieSwipe: async (sessionId: string, memberId: string, movieId: number, liked: boolean): Promise<void> => {
    try {
      console.log('Starting updateMovieSwipe:', {
        sessionId,
        memberId,
        movieId,
        liked
      });

      const sessionRef = doc(db, 'sessions', sessionId);
      const snapshot = await getDoc(sessionRef);
      
      if (!snapshot.exists()) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const sessionData = snapshot.data() as Session;

      // Validate member belongs to session
      if (!sessionData.members.includes(memberId)) {
        throw new Error(`Member ${memberId} not found in session ${sessionId}`);
      }

      // Initialize swipes if needed
      const swipes = sessionData.swipes || {};
      if (!swipes[movieId]) {
        swipes[movieId] = {};
      }
      swipes[movieId][memberId] = liked;

      // Create history entry with current timestamp
      const historyEntry: UserSwipeHistory = {
        movieId,
        decision: liked,
        timestamp: Date.now()
      };

      // Initialize user history if needed
      if (!sessionData.userHistory) {
        sessionData.userHistory = {};
      }
      if (!sessionData.userHistory[memberId]) {
        sessionData.userHistory[memberId] = [];
      }

      const userHistory = {
        ...sessionData.userHistory,
        [memberId]: [...(sessionData.userHistory[memberId] || []), historyEntry]
      };

      // Check for match with other user's previous swipes
      const otherMember = sessionData.members.find(id => id !== memberId);
      const isMatch = otherMember && swipes[movieId][otherMember] === true && liked;

      console.log('Preparing batch update:', {
        swipes: Object.keys(swipes).length,
        userHistoryLength: userHistory[memberId].length,
        isMatch
      });

      const batch = writeBatch(db);
      batch.update(sessionRef, {
        swipes,
        viewedMovies: arrayUnion(movieId),
        userHistory,
        ...(isMatch && { matches: arrayUnion(movieId) })
      });

      await batch.commit();
      console.log('Successfully updated session with swipe');
    } catch (error: any) {
      console.error('Error in updateMovieSwipe:', {
        error: error.message,
        stack: error.stack,
        sessionId,
        memberId,
        movieId
      });
      throw new Error(`Failed to update movie swipe: ${error.message}`);
    }
  },

  // Update current movie for a specific user
  updateCurrentMovie: async (sessionId: string, movieId: number): Promise<void> => {
    const sessionRef = doc(db, 'sessions', sessionId);
    const batch = writeBatch(db);
    
    batch.update(sessionRef, {
      currentMovieId: movieId
    });

    await batch.commit();
  },

  // Leave session
  leaveSession: async (sessionId: string, memberId: string): Promise<void> => {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snapshot = await getDoc(sessionRef);
    
    if (!snapshot.exists()) return;

    const sessionData = snapshot.data() as Session;
    const updatedMembers = sessionData.members.filter(id => id !== memberId);

    const batch = writeBatch(db);
    batch.update(sessionRef, {
      members: updatedMembers,
      active: updatedMembers.length > 0
    });

    await batch.commit();
  },

  // Get user's swipe history
  getUserHistory: async (sessionId: string, memberId: string): Promise<UserSwipeHistory[]> => {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snapshot = await getDoc(sessionRef);
    
    if (!snapshot.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = snapshot.data() as Session;
    return sessionData.userHistory[memberId] || [];
  },

  // Set matching session ID atomically if absent
  setMatchingSessionIdIfAbsent: async (sessionId: string, matchingSessionId: string): Promise<void> => {
    const sessionRef = doc(db, 'sessions', sessionId);
    
    await runTransaction(db, async (transaction) => {
      const sessionDoc = await transaction.get(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }
      
      const sessionData = sessionDoc.data() as Session;
      
      // Only set if not already present (atomic check-and-set)
      if (!sessionData.matchingSessionId) {
        transaction.update(sessionRef, { matchingSessionId });
        console.log('[SessionService] Set matching session ID:', matchingSessionId);
      } else {
        console.log('[SessionService] Matching session ID already exists:', sessionData.matchingSessionId);
      }
    });
  }
}; 