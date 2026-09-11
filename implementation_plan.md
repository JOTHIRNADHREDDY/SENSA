# Authentication Implementation Plan

## Problem Summary
The current authentication flow relies completely on Firebase Phone Auth on the client side (`signInWithPhoneNumber`), which is disabled in your Firebase console ("auth/operation-not-allowed"). Furthermore, the frontend handles validation logic, meaning email/phone uniqueness constraints and OTP validation can be bypassed, violating your security requirements.

## Proposed Architecture

We will implement a custom, secure backend-managed authentication flow using Cloudflare Workers. 

### 1. Database Adjustments (Firestore)
We will define strict indexes and query patterns to ensure `normalizedEmail` and `normalizedPhoneNumber` are globally unique across the `users` collection.

### 2. Backend OTP & SMS Flow (Cloudflare Worker)
We will introduce a custom OTP system.
- **`POST /api/v1/auth/check`**: Checks if an email/phone already exists.
- **`POST /api/v1/auth/send-otp`**: Generates a 6-digit OTP, stores a hashed version in a new Firestore `otps` collection with expiration (e.g., 10 mins) and rate-limiting. Sends the OTP via an SMS provider (e.g., Twilio).
- **`POST /api/v1/auth/verify-otp`**: Verifies the OTP. If valid, issues a temporary, cryptographically signed `verificationToken` (JWT) to the frontend, valid for 15 minutes.

### 3. Account Creation (Cloudflare Worker)
- **`POST /api/v1/auth/register`**: 
  - Validates the `verificationToken`.
  - Re-verifies uniqueness of `email` and `phone`.
  - Uses the Firebase Admin REST API (or Custom Token Minting) to create the user account in Firebase Auth.
  - Creates the comprehensive user profile in Firestore.
  - Generates a Firebase Custom Token using the `FIREBASE_PRIVATE_KEY` stored in Worker secrets, and returns it to the client.
- **Frontend**: Calls `signInWithCustomToken` using the returned Custom Token to complete the login.

### 4. Google Sign-In Flow
When a user uses Google Sign-In, Firebase Auth will create a user record. 
- The frontend will check if the user has a profile via `GET /api/v1/auth/profile`.
- If the profile exists and is verified, login proceeds.
- If it's a new user, the frontend will prompt for the phone number.
- The frontend follows the OTP flow (`send-otp`, `verify-otp`).
- Once verified, the frontend calls `POST /api/v1/auth/link-google` (a new endpoint) with the `verificationToken`. 
- The backend checks phone uniqueness. If unique, it creates the Firestore profile, permanently linking the phone number to the Google user. If the phone is taken, the backend returns a conflict error and the frontend signs the user out of the orphaned Google session.

## User Review Required

> [!IMPORTANT]
> **SMS Provider Configuration:** Cloudflare Workers require an external HTTP API to send SMS messages (like Twilio, Vonage, or AWS SNS). I will implement the integration for **Twilio** by default, as it's the industry standard. You will need to add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` to your Cloudflare Worker environment variables. Is this acceptable, or do you have a different provider in mind?

> [!WARNING]
> **Firebase Google Sign-In Orphaned Accounts:** Because we cannot intercept Google Sign-In before Firebase creates the Auth record (without using Firebase Functions Blocking Triggers), a user who starts Google Sign-In but abandons the phone verification will leave behind an "orphaned" Firebase Auth record (no Firestore profile). This is standard for this architecture. The application logic will correctly treat them as unverified and prompt them to complete signup upon next login. Is this acceptable?

## Proposed Changes

### Cloudflare Worker (Backend)
- `[MODIFY] backend/api/workers/auth/index.ts`: Implement new routing and controllers for `send-otp`, `verify-otp`, `register`, `link-google`, and `check`.
- `[NEW] backend/api/workers/auth/otp.ts`: Implement OTP generation, hashing, verification, rate limiting, and Twilio API integration.
- `[NEW] backend/api/workers/auth/jwt.ts`: Implement Custom Token generation using Web Crypto API and `FIREBASE_PRIVATE_KEY`.
- `[MODIFY] backend/api/workers/api/index.ts`: Update CORS and routing if necessary.
- `[MODIFY] backend/api/utils/firestore.ts`: Add `firestoreQuery` implementations to support uniqueness checks.
- `[MODIFY] backend/api/.dev.vars.example`: Add Twilio and Custom Token variables.

### Frontend
- `[MODIFY] frontend/src/components/SignupModal.tsx`: Rip out client-side Firebase Phone Auth (`signInWithPhoneNumber`). Implement the new backend-driven state machine (`INITIAL -> CHECKING -> OTP_SENT -> VERIFIED -> REGISTERING -> DONE`).
- `[MODIFY] frontend/src/components/auth/LoginPage.tsx`: Connect the simulated login/SSO flows to actual Firebase Auth, and enforce the "profile exists" check.
- `[MODIFY] frontend/src/lib/AuthContext.tsx`: Add support for `signInWithCustomToken` and token management.

## Verification Plan
1. **New Email + New Phone**: Verify end-to-end OTP and account creation.
2. **Duplicate Checks**: Attempt to register with an existing email and existing phone to verify backend rejection.
3. **Google Sign-In**: Test Google flow for new users (prompts for phone) and existing users (skips phone prompt).
4. **OTP Security**: Test invalid OTPs, expired OTPs, and rate limiting.
