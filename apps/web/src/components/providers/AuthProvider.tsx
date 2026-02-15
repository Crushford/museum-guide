'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  refreshAdminClaims: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          const tokenResult = await firebaseUser.getIdTokenResult();
          setIsAdmin(tokenResult.claims.admin === true);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Failed to read Firebase auth claims:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) {
      throw new Error('Not authenticated');
    }
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  const refreshAdminClaims = useCallback(async () => {
    if (!auth.currentUser) {
      setIsAdmin(false);
      return false;
    }

    try {
      const tokenResult = await auth.currentUser.getIdTokenResult(true);
      const admin = tokenResult.claims.admin === true;
      setIsAdmin(admin);
      return admin;
    } catch (error) {
      console.error('Failed to refresh Firebase auth claims:', error);
      setIsAdmin(false);
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      signIn,
      signOut,
      getIdToken,
      refreshAdminClaims,
    }),
    [user, loading, isAdmin, signIn, signOut, getIdToken, refreshAdminClaims]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
