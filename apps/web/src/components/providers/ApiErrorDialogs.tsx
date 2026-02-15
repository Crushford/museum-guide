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

const FEEDBACK_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_URL || process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://forms.gle/';
const LINKEDIN_URL = 'https://linkedin.com/in/jrushford';

export function ApiErrorDialogs() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [showGlobalLimit, setShowGlobalLimit] = useState(false);
  const [showAuthRequired, setShowAuthRequired] = useState(false);
  const [userLimitUsage, setUserLimitUsage] = useState<UsageSnapshot | null>(null);

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

      if (payload.code === 'SIGNUP_WAITLIST') {
        router.push('/waitlist');
      }
    };

    window.addEventListener(apiErrorEventName(), handleError as EventListener);
    return () => {
      window.removeEventListener(apiErrorEventName(), handleError as EventListener);
    };
  }, [router]);

  return (
    <>
      <Dialog open={showGlobalLimit} onOpenChange={setShowGlobalLimit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prototype limit reached for today</DialogTitle>
            <DialogDescription>
              We appreciate you using Museum Guide. This app is still in prototype stage and
              we have hit the usage limits set for today. For the rest of the day, Museum Guide
              will not run any more actions.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            I am keen to hear your feedback on what we can improve. Please use the feedback form
            below. It goes straight to my email address and I read every message.
          </p>
          <p className="text-sm text-muted-foreground">Thanks again, James Rushford</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowGlobalLimit(false)}>
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
              Museum Guide is in prototype stage, so each user has a daily usage limit. You have
              reached yours for today.
            </DialogDescription>
          </DialogHeader>

          {userLimitUsage && (
            <div className="space-y-2 text-sm">
              <p>Today you have:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  Created {userLimitUsage.user.artifactCreates} artifacts from scans
                </li>
                <li>Created {userLimitUsage.user.museumCreates} museums</li>
                <li>Made {userLimitUsage.user.llmCalls} LLM requests</li>
                <li>Made {userLimitUsage.user.wikiCalls} Wikipedia requests</li>
              </ul>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            To increase your limits, contact me for a promo code to try the premium experience.
          </p>

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
              Welcome, and thanks for checking out Museum Guide. To create new museums and
              artifacts, you need to be signed in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAuthRequired(false)}>
              Close
            </Button>
            <Button onClick={() => void signIn()}>Sign in with Google</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
