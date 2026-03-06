import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import {
  enforceSignupPolicy,
  getPremiumAllowanceForUser,
  getUserUsageForToday,
} from '../../lib/usage-limits';
import { prisma } from '@repo/db';
import { requireActor } from '../../http/guards';
import {
  BETA_TESTER_PROMO_CODE,
  BETA_TESTER_PROMO_LIMIT,
  canCreateContent,
  dbRoleFromUserRole,
  normalizeDbRole,
} from '../../lib/user-roles';

const redeemPromoSchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      code: z.string().trim().min(1, { error: 'Promo code is required' }),
    })
  )
  .transform((value) => ({
    code: value.code.trim().toLowerCase(),
  }));

const WAITLIST_URL =
  process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://forms.gle/U1PqnrG22YzV2sXu8';

export const router = Router();

router.get('/auth/status', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const allowed = await enforceSignupPolicy({ actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(actor.uid);
  const premiumAllowance = await getPremiumAllowanceForUser(actor.uid);
  res.json({
    uid: actor.uid,
    email: actor.email ?? null,
    displayName: actor.displayName ?? null,
    isAdmin: actor.isAdmin,
    role: actor.role,
    canCreate: actor.canCreate,
    usage,
    premiumAllowance,
  });
});

router.get('/account/usage', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const allowed = await enforceSignupPolicy({ actor, res });
  if (!allowed) {
    return;
  }

  const usage = await getUserUsageForToday(actor.uid);
  const premiumAllowance = await getPremiumAllowanceForUser(actor.uid);
  res.json({
    user: {
      uid: actor.uid,
      email: actor.email ?? null,
      displayName: actor.displayName ?? null,
      isAdmin: actor.isAdmin,
      role: actor.role,
      canCreate: actor.canCreate,
    },
    usage,
    premiumAllowance,
  });
});

router.post('/account/redeem-promo', requireAuth, async (req, res) => {
  const actor = requireActor(req);

  const allowed = await enforceSignupPolicy({ actor, res });
  if (!allowed) {
    return;
  }

  const parsed = redeemPromoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PROMO_CODE',
        message: 'Promo code is required.',
      },
    });
  }

  const { code } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    let promoCode = await tx.promoCode.findUnique({
      where: { code },
    });

    // Keep the requested beta code seeded and enforced in DB.
    if (!promoCode && code === BETA_TESTER_PROMO_CODE) {
      promoCode = await tx.promoCode.create({
        data: {
          code: BETA_TESTER_PROMO_CODE,
          maxRedemptions: BETA_TESTER_PROMO_LIMIT,
          isActive: true,
        },
      });
    }

    if (!promoCode || !promoCode.isActive) {
      return { status: 'invalid' as const };
    }

    const existing = await tx.appUser.findUnique({
      where: { uid: actor.uid },
      select: { uid: true, role: true },
    });
    const currentRole = normalizeDbRole(existing?.role, actor.isAdmin);
    if (currentRole === 'admin') {
      return {
        status: 'already',
        role: 'admin' as const,
        code: promoCode.code,
        limit: promoCode.maxRedemptions,
        usedCount: await tx.promoCodeRedemption.count({
          where: { promoCodeId: promoCode.id },
        }),
      } as const;
    }

    const userRedemptionCount = await tx.promoCodeRedemption.count({
      where: {
        promoCodeId: promoCode.id,
        userUid: actor.uid,
      },
    });
    if (userRedemptionCount >= 2) {
      return {
        status: 'per_user_limit' as const,
        role: 'premium' as const,
        code: promoCode.code,
        limit: promoCode.maxRedemptions,
        usedCount: await tx.promoCodeRedemption.count({
          where: { promoCodeId: promoCode.id },
        }),
      } as const;
    }

    const usedCount = await tx.promoCodeRedemption.count({
      where: { promoCodeId: promoCode.id },
    });
    if (usedCount >= promoCode.maxRedemptions) {
      return {
        status: 'limit_reached',
        usedCount,
        limit: promoCode.maxRedemptions,
      } as const;
    }

    await tx.appUser.upsert({
      where: { uid: actor.uid },
      update: {
        email: actor.email ?? null,
        displayName: actor.displayName ?? null,
        role: dbRoleFromUserRole('premium'),
        upgradeCode: promoCode.code,
        upgradedAt: new Date(),
        premiumMuseumCreatesUsed: 0,
        premiumArtifactCreatesUsed: 0,
        premiumQuestionsAskedUsed: 0,
      } as any,
      create: {
        uid: actor.uid,
        email: actor.email ?? null,
        displayName: actor.displayName ?? null,
        role: dbRoleFromUserRole('premium'),
        upgradeCode: promoCode.code,
        upgradedAt: new Date(),
        premiumMuseumCreatesUsed: 0,
        premiumArtifactCreatesUsed: 0,
        premiumQuestionsAskedUsed: 0,
      } as any,
    });

    await tx.promoCodeRedemption.create({
      data: {
        promoCodeId: promoCode.id,
        userUid: actor.uid,
      },
    });

    return {
      status: 'upgraded',
      usedCount: usedCount + 1,
      limit: promoCode.maxRedemptions,
      code: promoCode.code,
    } as const;
  });

  if (result.status === 'invalid') {
    return res.status(400).json({
      error: {
        code: 'INVALID_PROMO_CODE',
        message: 'Promo code is invalid.',
      },
    });
  }

  if (result.status === 'limit_reached') {
    return res.status(403).json({
      error: {
        code: 'SIGNUP_WAITLIST',
        message:
          'Promo code capacity has been reached. Please join the waitlist.',
        waitlistUrl: WAITLIST_URL,
      },
    });
  }

  if (result.status === 'per_user_limit') {
    return res.status(403).json({
      error: {
        code: 'PROMO_CODE_USER_LIMIT',
        message:
          'You have already used this promo code the maximum of 2 times.',
      },
    });
  }

  const role = result.status === 'already' ? result.role : 'premium';
  const effectiveCode = 'code' in result ? result.code : BETA_TESTER_PROMO_CODE;
  const effectiveLimit =
    'limit' in result ? result.limit : BETA_TESTER_PROMO_LIMIT;
  return res.json({
    status: result.status,
    role,
    canCreate: canCreateContent(role),
    promoCode: effectiveCode,
    limit: effectiveLimit,
    used: result.usedCount,
    remaining: Math.max(0, effectiveLimit - result.usedCount),
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
