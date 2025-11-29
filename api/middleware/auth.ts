/**
 * @file auth.ts
 * @description Middleware to verify Firebase Authentication tokens.
 */

import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Path to the Firebase service account key file.
 * Prioritizes environment variable FIREBASE_SERVICE_ACCOUNT_KEY_PATH for production (Render).
 * Fallbacks to local relative path for development.
 */
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || path.join(process.cwd(), 'api/config/serviceAccountKey.json');

console.log(`Attempting to load Firebase credentials from: ${serviceAccountPath}`);

// Initialize Firebase Admin SDK
try {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found at: ${serviceAccountPath}`);
  }

  const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountRaw) as ServiceAccount;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully.');
  }
} catch (error) {
  console.error('CRITICAL ERROR: Failed to initialize Firebase Admin.');
  console.error(error);
  // Exit process because the server cannot function without authentication
  if (process.env.NODE_ENV === 'production') {
     process.exit(1); 
  }
}

/**
 * Verifies a Firebase ID token.
 * @param {string} token - The Firebase ID token to verify.
 * @returns {Promise<admin.auth.DecodedIdToken>} The decoded token payload.
 * @throws {Error} If the token is invalid or verification fails.
 */
export const verifyToken = async (token: string): Promise<admin.auth.DecodedIdToken> => {
  try {
    // Ensure app is initialized before verification
    if (!admin.apps.length) {
      throw new Error('Firebase Admin not initialized');
    }
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw new Error('Unauthorized: Invalid token');
  }
};
