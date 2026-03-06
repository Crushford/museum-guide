export const USER_ROLES = ['free', 'premium', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const BETA_TESTER_PROMO_CODE = 'beta-tester-james';
export const BETA_TESTER_PROMO_LIMIT = 15;
export const PREMIUM_ALLOWANCE_LIMITS = {
  museums: 20,
  artifacts: 100,
  questions: 200,
} as const;

export function normalizeDbRole(
  role: string | null | undefined,
  isAdminClaim: boolean
): UserRole {
  if (isAdminClaim || role === 'ADMIN') {
    return 'admin';
  }
  if (role === 'PREMIUM') {
    return 'premium';
  }
  return 'free';
}

export function dbRoleFromUserRole(
  role: UserRole
): 'FREE' | 'PREMIUM' | 'ADMIN' {
  if (role === 'admin') return 'ADMIN';
  if (role === 'premium') return 'PREMIUM';
  return 'FREE';
}

export function canCreateContent(role: UserRole): boolean {
  return role === 'premium' || role === 'admin';
}
