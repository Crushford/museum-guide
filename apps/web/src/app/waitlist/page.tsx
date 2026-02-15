import Link from 'next/link';
import { SectionCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/page-title';

const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://forms.gle/U1PqnrG22YzV2sXu8';

export default function WaitlistPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <PageTitle>Signups are limited right now</PageTitle>
      <SectionCard title="Waitlist" subtitle="Museum Guide prototype access is currently capped.">
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Museum Guide is still in prototype stage and I am limiting new accounts while I keep
            costs under control.
          </p>
          <p>
            You are very welcome to join the waitlist below, and I will invite more people as
            capacity opens up.
          </p>
          <p>Thanks for your interest, I really appreciate it.</p>
          <div className="flex gap-2">
            <Button asChild>
              <a href={WAITLIST_URL} target="_blank" rel="noreferrer">
                Join the waitlist
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/">Back to homepage</Link>
            </Button>
          </div>
        </div>
      </SectionCard>
    </main>
  );
}
