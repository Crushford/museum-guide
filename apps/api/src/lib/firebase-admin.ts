import {
  initializeApp,
  cert,
  getApps,
  applicationDefault,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const hasServiceAccountEnv =
  !!process.env.FIREBASE_PROJECT_ID &&
  !!process.env.FIREBASE_CLIENT_EMAIL &&
  !!process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (hasServiceAccountEnv) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId:
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        process.env.FIREBASE_PROJECT_ID,
    });
  }
}

export const adminAuth = getAuth();
