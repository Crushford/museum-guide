'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api-errors';

const WAITLIST_URL =
  process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://forms.gle/U1PqnrG22YzV2sXu8';
const EXAMPLE_MUSEUM_PATH = '/altes-museum';

type RedeemPromoResponse = {
  status: 'upgraded' | 'already';
  role: 'premium' | 'admin';
  canCreate: boolean;
  limit: number;
  used: number;
  remaining: number;
};

export default function SignupPage() {
  const authedApi = useAuthedApi();
  const { user, loading, signIn, role, canCreate, refreshRole } = useAuth();
  const [promoCode, setPromoCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const alreadyCreator = useMemo(
    () => canCreate || role === 'premium' || role === 'admin',
    [canCreate, role]
  );

  const handleRedeem = async () => {
    const trimmedCode = promoCode.trim();
    if (!trimmedCode) {
      setError('Please enter a beta tester code.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await authedApi.mutate<RedeemPromoResponse>(
        '/account/redeem-promo',
        { method: 'POST', body: { code: trimmedCode } }
      );
      await refreshRole();
      setSuccess(
        response.status === 'already'
          ? 'This account already has premium access.'
          : `Premium activated. ${response.remaining} beta tester spot(s) remain.`
      );
    } catch (upgradeError) {
      if (
        upgradeError instanceof ApiRequestError &&
        upgradeError.body?.code === 'SIGNUP_WAITLIST'
      ) {
        window.location.assign(WAITLIST_URL);
        return;
      }

      if (
        upgradeError instanceof ApiRequestError &&
        upgradeError.body?.code === 'INVALID_PROMO_CODE'
      ) {
        setError('That beta tester code is invalid.');
        return;
      }

      if (
        upgradeError instanceof ApiRequestError &&
        upgradeError.body?.code === 'PROMO_CODE_USER_LIMIT'
      ) {
        setError('You can use the same promo code at most 2 times.');
        return;
      }

      setError(
        upgradeError instanceof Error
          ? upgradeError.message
          : 'Unable to redeem promo code.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && !user) {
    return (
      <PageLayout title="Sign Up" narrow>
        <SectionCard title="Sign in" subtitle="Use Google to continue.">
          <Button onClick={() => void signIn()}>Sign in with Google</Button>
        </SectionCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Welcome" narrow>
      <div className="space-y-6">
        <SectionCard
          title="Museum Guide Is In Testing Mode"
          subtitle="Your account starts as a free user."
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              As a free user, you can view existing museum pages and browse
              content.
            </p>
            <p>
              Free users cannot create new museums or new artifacts during
              testing.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild>
                <Link href={EXAMPLE_MUSEUM_PATH}>
                  Browse Altes Museum (Berlin)
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/account">Go to account</Link>
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Beta Tester Access"
          subtitle="Have a promo code? Redeem it below."
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Want premium access? Join the waitlist to request a beta tester
              code.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <a href={WAITLIST_URL} target="_blank" rel="noreferrer">
                  Join Waitlist
                </a>
              </Button>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Enter beta tester code"
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                disabled={submitting || alreadyCreator}
              />
              <Button
                onClick={() => void handleRedeem()}
                disabled={submitting || alreadyCreator}
              >
                {alreadyCreator ? 'Premium Active' : 'Redeem Code'}
              </Button>
            </div>

            {error && <Alert>{error}</Alert>}
            {success && <Alert>{success}</Alert>}
          </div>
        </SectionCard>
      </div>
    </PageLayout>
  );
}
