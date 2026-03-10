'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StructuredApiErrorBody, UsageSnapshot } from '@/lib/api-errors';
import { apiErrorEventName } from '@/lib/api-errors';
import { CONTACT_EMAIL, JAMES_LINKEDIN_URL } from '@/lib/constants';

const FEEDBACK_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_URL ||
  process.env.NEXT_PUBLIC_WAITLIST_URL ||
  'https://forms.gle/';
const WAITLIST_URL =
  process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://forms.gle/U1PqnrG22YzV2sXu8';
const LINKEDIN_URL = JAMES_LINKEDIN_URL;

export function ApiErrorDialogs() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [showGlobalLimit, setShowGlobalLimit] = useState(false);
  const [showAuthRequired, setShowAuthRequired] = useState(false);
  const [showAuthRateLimit, setShowAuthRateLimit] = useState(false);
  const [showAuthSignInFailed, setShowAuthSignInFailed] = useState(false);
  const [userLimitUsage, setUserLimitUsage] = useState<UsageSnapshot | null>(
    null
  );

  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<StructuredApiErrorBody>;
      const payload = customEvent.detail;
      if (!payload?.code) return;

      if (payload.code === 'LIMIT_GLOBAL_DAILY') {
        setShowGlobalLimit(true);
        return;
      }

      if (payload.code === 'LIMIT_USER_DAILY') {
        setUserLimitUsage(payload.usage ?? null);
        return;
      }

      if (payload.code === 'AUTH_REQUIRED') {
        setShowAuthRequired(true);
        return;
      }

      if (payload.code === 'RATE_LIMIT_AUTH') {
        setShowAuthRateLimit(true);
        return;
      }

      if (payload.code === 'AUTH_SIGNIN_FAILED') {
        setShowAuthSignInFailed(true);
        return;
      }

      if (payload.code === 'SIGNUP_WAITLIST') {
        router.push('/waitlist');
        return;
      }

      if (payload.code === 'PREMIUM_ALLOWANCE_LIMIT') {
        router.push('/activity');
      }
    };

    window.addEventListener(apiErrorEventName(), handleError as EventListener);
    return () => {
      window.removeEventListener(
        apiErrorEventName(),
        handleError as EventListener
      );
    };
  }, [router]);

  return (
    <>
      <Dialog open={showGlobalLimit} onOpenChange={setShowGlobalLimit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prototype limit reached for today</DialogTitle>
            <DialogDescription>
              We appreciate you using Museum Guide. This app is still in
              prototype stage and we have hit the usage limits set for today.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            I am still working out how this app works and I am trying to avoid
            running up large bills, so for the rest of today Museum Guide will
            not run more actions.
          </p>
          <p className="text-sm text-muted-foreground">
            I am super keen to hear your feedback on anything we can improve.
            The form below goes straight to my email and I really appreciate any
            feedback you have.
          </p>
          <p className="text-sm text-muted-foreground">
            Thanks again, James Rushford
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowGlobalLimit(false)}
            >
              Close
            </Button>
            <Button asChild>
              <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
                Open feedback form
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={userLimitUsage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUserLimitUsage(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You have reached your daily limit</DialogTitle>
            <DialogDescription>
              Museum Guide is in prototype stage, so each user has a daily usage
              limit. You have reached your limit for today.
            </DialogDescription>
          </DialogHeader>

          {userLimitUsage && (
            <div className="space-y-2 text-sm">
              <p>Today you have:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  Created {userLimitUsage.user.artifactCreates} artifacts from
                  scans
                </li>
                <li>Created {userLimitUsage.user.museumCreates} museums</li>
                <li>Made {userLimitUsage.user.llmCalls} LLM requests</li>
                <li>Made {userLimitUsage.user.wikiCalls} Wikipedia requests</li>
              </ul>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            To increase your limits, contact me for a promo code to try the
            premium experience. You can reach me on LinkedIn:{' '}
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              linkedin.com/in/rushfordj
            </a>
          </p>
          <p className="text-sm text-muted-foreground">
            Thanks again for using Museum Guide.
          </p>
          <p className="text-sm text-muted-foreground">James Rushford</p>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setUserLimitUsage(null)}>
              Close
            </Button>
            <Button asChild>
              <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">
                Contact on LinkedIn
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthRequired} onOpenChange={setShowAuthRequired}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in required</DialogTitle>
            <DialogDescription>
              Thanks for visiting Museum Guide. To use Museum Guide, you must
              sign in first.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This app is in the testing phase right now, but you can join the
            waitlist and I will invite more people as capacity opens up.
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowAuthRequired(false)}
            >
              Close
            </Button>
            <Button onClick={() => void signIn()}>Sign in with Google</Button>
            <Button variant="link" asChild>
              <a href={WAITLIST_URL} target="_blank" rel="noreferrer">
                Join waitlist
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthRateLimit} onOpenChange={setShowAuthRateLimit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Too many auth attempts</DialogTitle>
            <DialogDescription>
              We are temporarily limiting authentication checks. Please wait a
              moment and try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowAuthRateLimit(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAuthSignInFailed}
        onOpenChange={setShowAuthSignInFailed}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in failed</DialogTitle>
            <DialogDescription>
              Sorry, something went wrong while signing you in.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            We logged this error and will look at it ASAP.
          </p>
          <p className="text-sm text-muted-foreground">
            If you have questions, contact James at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowAuthSignInFailed(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
