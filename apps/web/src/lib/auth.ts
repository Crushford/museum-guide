import { prisma } from '@repo/db';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

type GoogleProfile = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  pages: {
    signIn: '/',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return false;

      const providerAccountId = account.providerAccountId;
      const email = user.email;
      if (!providerAccountId || !email) return false;

      const profileData = (profile || {}) as GoogleProfile;
      const displayName = user.name || profileData.name || null;
      const avatarUrl = user.image || profileData.picture || null;

      const dbUser = await prisma.user.upsert({
        where: { googleSub: providerAccountId },
        update: {
          email,
          displayName,
          avatarUrl,
          deletedAt: null,
        },
        create: {
          email,
          googleSub: providerAccountId,
          displayName,
          avatarUrl,
        },
        select: {
          id: true,
        },
      });

      await prisma.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId,
          },
        },
        update: {
          userId: dbUser.id,
          accessToken:
            typeof account.access_token === 'string'
              ? account.access_token
              : null,
          refreshToken:
            typeof account.refresh_token === 'string'
              ? account.refresh_token
              : null,
          idToken:
            typeof account.id_token === 'string' ? account.id_token : null,
          tokenType:
            typeof account.token_type === 'string' ? account.token_type : null,
          scope: typeof account.scope === 'string' ? account.scope : null,
          expiresAt:
            typeof account.expires_at === 'number' ? account.expires_at : null,
        },
        create: {
          userId: dbUser.id,
          provider: account.provider,
          providerAccountId,
          accessToken:
            typeof account.access_token === 'string'
              ? account.access_token
              : null,
          refreshToken:
            typeof account.refresh_token === 'string'
              ? account.refresh_token
              : null,
          idToken:
            typeof account.id_token === 'string' ? account.id_token : null,
          tokenType:
            typeof account.token_type === 'string' ? account.token_type : null,
          scope: typeof account.scope === 'string' ? account.scope : null,
          expiresAt:
            typeof account.expires_at === 'number' ? account.expires_at : null,
        },
      });

      return true;
    },
    async jwt({ token, account, user }) {
      if (account?.provider === 'google' && account.providerAccountId) {
        const dbUser = await prisma.user.findUnique({
          where: { googleSub: account.providerAccountId },
          select: { id: true, tier: true, role: true },
        });
        if (dbUser) {
          token.appUserId = dbUser.id;
          token.appUserTier = dbUser.tier;
          token.appUserRole = dbUser.role;
        }
      } else if (!token.appUserId && user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, tier: true, role: true },
        });
        if (dbUser) {
          token.appUserId = dbUser.id;
          token.appUserTier = dbUser.tier;
          token.appUserRole = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.appUserId === 'string' ? token.appUserId : '';
        session.user.tier =
          token.appUserTier === 'PREMIUM' ? 'PREMIUM' : 'MEMBER';
        session.user.role = token.appUserRole === 'ADMIN' ? 'ADMIN' : 'USER';
      }
      return session;
    },
  },
};
