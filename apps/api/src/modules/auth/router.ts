import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import {
  enforceSignupPolicy,
  getUserUsageForToday,
} from '../../lib/usage-limits';
import { prisma } from '@repo/db';
import { requireActor } from '../../http/guards';

export const router = Router();

router.get('/auth/status', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const allowed = await enforceSignupPolicy({ actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(actor.uid);
  res.json({
    uid: actor.uid,
    email: actor.email ?? null,
    displayName: actor.displayName ?? null,
    isAdmin: actor.isAdmin,
    usage,
  });
});

router.get('/account/usage', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const allowed = await enforceSignupPolicy({ actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(actor.uid);
  res.json({
    user: {
      uid: actor.uid,
      email: actor.email ?? null,
      displayName: actor.displayName ?? null,
      isAdmin: actor.isAdmin,
    },
    usage,
  });
});

router.get('/account/questions', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const questions = await prisma.artifactQuestion.findMany({
    where: { askedByUsername: actor.uid },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      artifact: { select: { slug: true, displayTitle: true } },
      museum: { select: { slug: true, name: true } },
    },
  });

  res.json(
    questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      answerText: q.answerText,
      status: q.status,
      upvotes: q.upvotes,
      askCount: q.askCount,
      createdAt: q.createdAt,
      artifact: { slug: q.artifact.slug, name: q.artifact.displayTitle },
      museum: { slug: q.museum.slug, name: q.museum.name },
    }))
  );
});
