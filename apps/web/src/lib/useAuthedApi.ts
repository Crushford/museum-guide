'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { authedApi, authedApiMutate, authedApiPost } from '@/lib/api';
import { ApiRequestError, emitApiError } from '@/lib/api-errors';

type AuthedRequestOptions = {
  requireAdmin?: boolean;
  adminErrorMessage?: string;
  requireCreator?: boolean;
  creatorErrorMessage?: string;
};

export function useAuthedApi() {
  const {
    user,
    isAdmin,
    canCreate,
    getIdToken,
    refreshAdminClaims,
    refreshRole,
  } = useAuth();

  const run = useCallback(
    async <T>(
      handler: (token: string) => Promise<T>,
      options?: AuthedRequestOptions
    ): Promise<T> => {
      const requireAdmin = options?.requireAdmin === true;
      const requireCreator = options?.requireCreator === true;

      if (!user) {
        const body = {
          code: 'AUTH_REQUIRED',
          message: 'Sign in required for this action.',
        } as const;
        emitApiError(body);
        throw new ApiRequestError({
          status: 401,
          body,
          message: body.message,
        });
      }

      if (requireAdmin && !isAdmin) {
        const refreshedIsAdmin = await refreshAdminClaims();
        if (!refreshedIsAdmin) {
          throw new Error(
            options?.adminErrorMessage ??
              'Admin access is required for this action.'
          );
        }
      }

      if (requireCreator && !canCreate) {
        const refreshedRole = await refreshRole();
        if (refreshedRole !== 'premium' && refreshedRole !== 'admin') {
          throw new Error(
            options?.creatorErrorMessage ??
              'Premium or admin access is required for this action.'
          );
        }
      }

      const token = await getIdToken(requireAdmin);
      return handler(token);
    },
    [canCreate, getIdToken, isAdmin, refreshAdminClaims, refreshRole, user]
  );

  const get = useCallback(
    async <T>(path: string, options?: AuthedRequestOptions): Promise<T> =>
      run((token) => authedApi<T>(path, token), options),
    [run]
  );

  const post = useCallback(
    async <T>(path: string, options?: AuthedRequestOptions): Promise<T> =>
      run((token) => authedApiPost<T>(path, token), options),
    [run]
  );

  const mutate = useCallback(
    async <T>(
      path: string,
      request: { method: string; body?: unknown },
      options?: AuthedRequestOptions
    ): Promise<T> =>
      run((token) => authedApiMutate<T>(path, request, token), options),
    [run]
  );

  return useMemo(() => ({ run, get, post, mutate }), [run, get, post, mutate]);
}
