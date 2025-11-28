/**
 * @file auth.ts
 * @description Middleware to verify Firebase Authentication tokens.
 */

import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Path to the Firebase service account key file.
 * Uses process.cwd() to locate the file relative to the project root,
 * ensuring it works for both source and compiled output (dist).
 */
const serviceAccountPath = path.join(process.cwd(), 'api/config/serviceAccountKey.json');

// Initialize Firebase Admin SDK
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serviceAccount = require(serviceAccountPath) as ServiceAccount;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  // Proceeding without initialization might cause errors later if auth is required
}

/**
 * Verifies a Firebase ID token.
 * @param {string} token - The Firebase ID token to verify.
 * @returns {Promise<admin.auth.DecodedIdToken>} The decoded token payload.
 * @throws {Error} If the token is invalid or verification fails.
 */
export const verifyToken = async (token: string): Promise<admin.auth.DecodedIdToken> => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw new Error('Unauthorized: Invalid token');
  }
};

