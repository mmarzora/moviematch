import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';

interface AuthProps {
  user: any;
}

const Auth: React.FC<AuthProps> = ({ user }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (user) {
    return (
      <div className="auth-container">
        <button onClick={handleSignOut} className="auth-button">
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <form onSubmit={handleSignIn}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
        />
        {error && <p className="auth-error">{error}</p>}
        <div className="auth-buttons">
          <button type="submit" className="auth-button">
            Sign In
          </button>
          <button type="button" onClick={handleSignUp} className="auth-button">
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
};

export default Auth; 