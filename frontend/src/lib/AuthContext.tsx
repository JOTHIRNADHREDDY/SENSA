import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, getAdditionalUserInfo, signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';

interface GoogleSignInResult {
  user: User;
  isNewUser: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<GoogleSignInResult>;
  loginWithCustomToken: (token: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => { throw new Error('AuthContext not initialized'); },
  loginWithCustomToken: async () => { throw new Error('AuthContext not initialized'); },
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<GoogleSignInResult> => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      return {
        user: result.user,
        isNewUser: additionalInfo?.isNewUser ?? false,
      };
    } catch (error: any) {
      // Map Firebase error codes to user-friendly messages
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in cancelled. You closed the popup before completing sign-in.');
      } else if (code === 'auth/popup-blocked') {
        throw new Error('Pop-up blocked by your browser. Please allow pop-ups for this site and try again.');
      } else if (code === 'auth/cancelled-popup-request') {
        throw new Error('Another sign-in attempt is already in progress.');
      } else if (code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email using a different sign-in method. Try signing in with that method instead.');
      } else if (code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection and try again.');
      }
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const loginWithCustomToken = async (token: string): Promise<User> => {
    try {
      const result = await signInWithCustomToken(auth, token);
      return result.user;
    } catch (error) {
      console.error("Error signing in with custom token", error);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, loginWithCustomToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
