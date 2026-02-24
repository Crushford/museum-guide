import {
  initializeApp,
  cert,
  getApps,
  applicationDefault,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '../config/env';

const hasServiceAccountEnv =
  !!env.FIREBASE_PROJECT_ID &&
  !!env.FIREBASE_CLIENT_EMAIL &&
  !!env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (hasServiceAccountEnv) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId:
        env.GOOGLE_CLOUD_PROJECT ||
        env.GCLOUD_PROJECT ||
        env.FIREBASE_PROJECT_ID,
    });
  }
}

export const adminAuth = getAuth();
