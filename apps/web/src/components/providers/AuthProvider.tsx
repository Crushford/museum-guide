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
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { API_URL } from '@/lib/api';
import { emitApiError, extractErrorBody } from '@/lib/api-errors';
import { reportError } from '@/lib/report-error';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  role: 'free' | 'premium' | 'admin';
  canCreate: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  refreshAdminClaims: () => Promise<boolean>;
  refreshRole: () => Promise<'free' | 'premium' | 'admin'>;
};

type AuthStatusResponse = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  role: 'free' | 'premium' | 'admin';
  canCreate: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<'free' | 'premium' | 'admin'>('free');
  const [canCreate, setCanCreate] = useState(false);
  const signInFailedMessage =
    'Sorry, something went wrong while signing you in. We logged this error and will look at it ASAP.';

  const loadAuthStatus = useCallback(
    async (firebaseUser: User): Promise<AuthStatusResponse | null> => {
      const token = await firebaseUser.getIdToken();
      const authStatusResponse = await fetch(`${API_URL}/auth/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!authStatusResponse.ok) {
        const payload = await authStatusResponse.json().catch(() => ({}));
        const errorBody = extractErrorBody(payload);
        if (errorBody?.code === 'SIGNUP_WAITLIST') {
          emitApiError(errorBody);
          await firebaseSignOut(auth);
          setUser(null);
          setIsAdmin(false);
          setRole('free');
          setCanCreate(false);
          return null;
        }

        if (authStatusResponse.status === 401) {
          emitApiError({
            code: 'AUTH_SIGNIN_FAILED',
            message:
              'Sorry, something went wrong while signing you in. We logged this error and will look at it ASAP.',
          });
          await firebaseSignOut(auth);
          setUser(null);
          setIsAdmin(false);
          setRole('free');
          setCanCreate(false);
          return null;
        }

        throw new Error('Failed to load auth status');
      }

      const status = (await authStatusResponse.json()) as AuthStatusResponse;
      setIsAdmin(status.isAdmin);
      setRole(status.role);
      setCanCreate(status.canCreate);
      return status;
    },
    []
  );

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const hadPostAuthFlag =
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem('post-auth-onboarding') === '1';

    if (hadPostAuthFlag) {
      fallbackTimer = setTimeout(() => {
        if (!auth.currentUser && typeof window !== 'undefined') {
          emitApiError({
            code: 'AUTH_SIGNIN_FAILED',
            message: signInFailedMessage,
          });
          window.sessionStorage.removeItem('post-auth-onboarding');
        }
      }, 1800);
    }

    void getRedirectResult(auth).catch((error) => {
      reportError(error, {
        message: 'Firebase redirect sign-in failed',
        tags: { feature: 'auth', action: 'redirect-signin' },
      });
      emitApiError({
        code: 'AUTH_SIGNIN_FAILED',
        message: signInFailedMessage,
      });
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('post-auth-onboarding');
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          const tokenResult = await firebaseUser.getIdTokenResult();
          setIsAdmin(tokenResult.claims.admin === true);
          await loadAuthStatus(firebaseUser);
          if (typeof window !== 'undefined') {
            const shouldShowOnboarding =
              window.sessionStorage.getItem('post-auth-onboarding') === '1';
            if (
              shouldShowOnboarding &&
              window.location.pathname !== '/signup'
            ) {
              window.sessionStorage.removeItem('post-auth-onboarding');
              window.location.assign('/signup');
              return;
            }
            window.sessionStorage.removeItem('post-auth-onboarding');
          }
        } else {
          if (typeof window !== 'undefined') {
            const attemptedSignIn =
              window.sessionStorage.getItem('post-auth-onboarding') === '1';
            if (attemptedSignIn) {
              emitApiError({
                code: 'AUTH_SIGNIN_FAILED',
                message: signInFailedMessage,
              });
              window.sessionStorage.removeItem('post-auth-onboarding');
            }
          }
          setIsAdmin(false);
          setRole('free');
          setCanCreate(false);
        }
      } catch (error) {
        console.error('Failed to read Firebase auth claims:', error);
        reportError(error, {
          message: 'Failed to read Firebase auth claims',
          tags: { feature: 'auth', action: 'read-claims' },
        });
        if (firebaseUser) {
          emitApiError({
            code: 'AUTH_SIGNIN_FAILED',
            message: signInFailedMessage,
          });
        }
        setIsAdmin(false);
        setRole('free');
        setCanCreate(false);
      } finally {
        setLoading(false);
      }
    });
    return () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      unsubscribe();
    };
  }, [loadAuthStatus, signInFailedMessage]);

  const signIn = useCallback(async () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('post-auth-onboarding', '1');
    }
    try {
      const usePopupForLocalDev =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');
      if (usePopupForLocalDev) {
        await signInWithPopup(auth, googleProvider);
        return;
      }
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      const popupErrorCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      const shouldFallbackToRedirect =
        popupErrorCode === 'auth/popup-blocked' ||
        popupErrorCode === 'auth/cancelled-popup-request';
      if (shouldFallbackToRedirect) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      reportError(error, {
        message: 'Failed to start Firebase Google sign-in redirect',
        tags: { feature: 'auth', action: 'start-redirect' },
      });
      emitApiError({
        code: 'AUTH_SIGNIN_FAILED',
        message: signInFailedMessage,
      });
    }
  }, [signInFailedMessage]);

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
      if (auth.currentUser) {
        await loadAuthStatus(auth.currentUser);
      }
      return admin;
    } catch (error) {
      console.error('Failed to refresh Firebase auth claims:', error);
      reportError(error, {
        message: 'Failed to refresh Firebase auth claims',
        tags: { feature: 'auth', action: 'refresh-claims' },
      });
      setIsAdmin(false);
      setRole('free');
      setCanCreate(false);
      return false;
    }
  }, [loadAuthStatus]);

  const refreshRole = useCallback(async () => {
    if (!auth.currentUser) {
      setRole('free');
      setCanCreate(false);
      return 'free';
    }

    const status = await loadAuthStatus(auth.currentUser);
    return status?.role ?? 'free';
  }, [loadAuthStatus]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      role,
      canCreate,
      signIn,
      signOut,
      getIdToken,
      refreshAdminClaims,
      refreshRole,
    }),
    [
      user,
      loading,
      isAdmin,
      role,
      canCreate,
      signIn,
      signOut,
      getIdToken,
      refreshAdminClaims,
      refreshRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
