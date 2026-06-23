# @notesify/auth

> A modular, security-first authentication engine for Express applications with Mongoose support.
>
> Designed around session lifecycle management, refresh token rotation, replay attack detection, and decoupled storage adapters.

---

## Why does this exist?

Modern web authentication is much more than issuing JWTs.

Production applications often require:

* 🔐 Short-lived access tokens
* 🔄 Refresh token rotation (RTR)
* 🚨 Replay attack detection
* 📱 Multi-device session management
* 🔍 Device auditing
* 🚪 Logout from individual devices
* ⚙️ Configurable authentication flows
* 📬 Pluggable notification providers

Most implementations solve these problems inside application-specific controllers and models.

`@notesify/auth` extracts them into a reusable authentication engine that remains independent of storage implementations and notification services.

---

## Core Design Principles

Every architectural decision follows a few simple principles inspired by the **Single Responsibility Principle**.

### 1. Authentication is its own domain
```text
User
  ↓ (Represents Identity)
Identity

AuthSession
  ↓ (Represents Authentication State)
Authentication State
```
User data and authentication state are intentionally separated. The library treats the user's document as read-only identity records and encapsulates active session states separately.

### 2. Storage should be replaceable
```text
Authentication Engine
          │
          ▼
   Storage Adapter
          │
    ┌─────┴─────┐
    ▼           ▼
Mongoose     Future Adapters
```
Business logic never directly depends on database implementations. Storage is accessed through a common interface, allowing the engine to adapt to different ORMs/ODMs without code modification.

### 3. Notifications belong to the application
Instead of sending emails or messages internally:
```text
Register
   │
   ▼
Emit Event
   │
   ▼
Application Decides:
  Email (Nodemailer, SendGrid, Resend)
  SMS / Push Notification
  Discord Webhook
  Custom Event Bus
```
The authentication engine remains completely notification provider-agnostic, emitting events to the parent application's lifecycles.

---

## Architecture

```text
                    createAuth()
                          │
                          ▼
              Authentication Engine
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
   Router            Auth Middleware      Event Hooks
                          │
                          ▼
                  Storage Adapter
                          │
                          ▼
                     Persistence
```

Every component has a single responsibility.

---

## Refresh Token Lifecycle

```text
Login
   │
   ▼
Access Token (15m)
Refresh Token (7d)
   │
   ▼
POST /refresh
   │
   ▼
Validate Current Refresh Token
   │
   ▼
Generate New Refresh Token
   │
   ▼
Invalidate Previous Refresh Token
   │
   ▼
Return Updated Authentication Pair
```

Only the newest refresh token remains valid.

---

## Replay Attack Protection

A replay attack occurs when a previously rotated refresh token is reused.

```text
User
 │
 └── Refresh Token A

Refresh Token A
        │
        ▼
Rotated
        │
        ▼
Refresh Token B

Attacker
        │
        ▼
Attempts Refresh Token A Again
        │
        ▼
Replay Detected
        │
        ▼
Revoke Every Active Session
        │
        ▼
401 Unauthorized
```

The library intentionally prioritizes account security over preserving active sessions.

---

## Why AuthSession?

Instead of embedding refresh tokens inside the User document:
```text
User
 ├── name
 ├── email
 └── password
```
and
```text
AuthSession
 ├── userId
 ├── tokenHash
 ├── device
 ├── browser
 ├── ip
 ├── lastUsedAt
 └── expiresAt
```
remain separate.

### Advantages:
* **Better separation of concerns**: Session states do not pollute identity records.
* **Rich session metadata**: Allows parsing browser, OS, and client IP without bloating the main user schema.
* **Independent TTL cleanup**: Deletes expired sessions cleanly using MongoDB's TTL index without locking the main user collection.
* **Device management**: Simplifies querying active devices and auditing activity.
* **Easier auditing**: Retains historical audit trails independently of active profile updates.

---

## Why StorageAdapter?

Authentication logic should not know whether data comes from:
* Mongoose
* Prisma
* Drizzle
* Redis
* A custom database implementation

The adapter layer maps application-specific models into a common interface, allowing the authentication engine to remain reusable, decoupled, and easily testable.

---

## Security Model

The library applies multiple defensive layers:

### Credentials
* bcrypt password hashing (10 rounds)
* Password fields excluded from queries by default

### Session Protection
* SHA-256 hashed refresh tokens (protects against database leaks bypassing passwords)
* HttpOnly, Secure cookies
* Configurable SameSite policy

### Session Lifecycle
* Refresh Token Rotation (RTR)
* Replay attack detection and automatic session revocation
* Automatic session expiration cleanup via MongoDB TTL indexes

### Verification
* Timing-safe token comparison (using `crypto.timingSafeEqual`) to prevent side-channel analysis
* Multi-session isolation
* Device auditing

---

## Built-in Session Management

Every authenticated session automatically tracks:
```text
Session ID
Browser
Operating System
Device Type
IP Address
Created At
Last Used At
Current Session
```
making features like:
```text
Current Devices

Chrome • Windows (Active Now)
Safari • macOS (Last active: Yesterday)
Chrome • Android (Last active: 2 days ago)

[Logout this device]
```
available without additional implementation.

---

## Design Trade-Offs & FAQ

### Why use refresh cookies instead of localStorage?
Storing access or refresh tokens in `localStorage` makes them susceptible to Cross-Site Scripting (XSS) attacks. If an attacker injects a script, they can read `localStorage` instantly. By placing the refresh token inside an `HttpOnly` cookie, client-side scripts cannot access it.

### Why hash refresh tokens?
If an attacker breaches your MongoDB database and steals the tables, they cannot decrypt passwords because they are bcrypt-hashed. However, if refresh tokens are stored in plain text, the attacker can copy them, set them as cookies in their browser, and bypass authentication completely. Hashing refresh tokens with SHA-256 ensures that a compromised database does not compromise active sessions.

### Why revoke every session after replay detection?
If a refresh token is reused, we have no way of knowing whether the legitimate user or the attacker reached the endpoint first. To guarantee account integrity, the library invalidates all active sessions for that user, neutralizing the stolen token and forcing a clean re-login.

### Why separate AuthSession instead of using arrays inside the User document?
Embedding refresh tokens inside the User document couples authentication state with user identity. It makes advanced session management, auditing, TTL cleanup, and tracking richer metadata difficult. A dedicated `AuthSession` collection separates responsibilities and scales naturally as authentication requirements evolve.

### Why use a database lookup on Access Tokens?
A purely stateless JWT setup cannot revoke access tokens before they naturally expire. To support instant "Log out this device" and "Logout everywhere" features, the library does a quick indexed database lookup on the `sessionId` in our auth middleware. We trade a tiny query latency for the ability to instantly lock out blacklisted devices.

---

## Installation & Local Integration

Since this package is in local development, you can link it directly to your Express projects:

### 1. Register the package locally
Run this command inside the root of this authentication package folder:
```bash
npm link
```

### 2. Connect it to your Express app
Run this command inside the root of your target Express application folder:
```bash
npm link @notesify/auth
```

---

## Environment Configuration

Configure your environment variables:

```env
# JWT Configurations
ACCESS_SECRET=your_super_secret_access_key
REFRESH_SECRET=your_super_secret_refresh_key
ACCESS_EXPIRE=15m
REFRESH_EXPIRE=7d

# URL Configurations
FRONTEND_URL=http://localhost:3000
```

---

## Quick Start

### 1. Initialize Auth Setup
Import the core library and set up the Mongoose adapter in your app entrypoint:

```javascript
import express from "express";
import cookieParser from "cookie-parser";
import { createAuth, MongooseStorageAdapter } from "@notesify/auth";

import User from "./models/User.js";
import AuthSession from "./models/AuthSession.js"; 

const app = express();
app.use(express.json());
app.use(cookieParser());

// Initialize Mongoose Adapter with Custom Field Mapping
const adapter = new MongooseStorageAdapter({
    userModel: User,
    sessionModel: AuthSession,
    fields: {
        email: "email",                  
        password: "passwordHash",
        isVerified: "isVerified",
        verificationToken: "emailVerifyToken",
        verificationTokenExpiry: "verifyTokenExpiresAt",
        forgotPasswordToken: "passwordResetToken",
        forgotPasswordExpiry: "passwordResetExpiresAt"
    }
});

const auth = createAuth({
    adapter,
    accessSecret: process.env.ACCESS_SECRET,
    refreshSecret: process.env.REFRESH_SECRET,
    accessExpiry: "15m",
    refreshExpiry: "7d",
    cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    },
    features: {
        emailVerification: true,
        forgotPassword: true,
        refreshRotation: true,
        multiSession: true
    },
    events: {
        onVerifyEmail: async ({ user, verificationUrl }) => {
            console.log(`Verification link: ${verificationUrl}`);
        },
        onForgotPassword: async ({ user, resetUrl }) => {
            console.log(`Password reset link: ${resetUrl}`);
        }
    }
});

// Mount routes
app.use("/api/auth", auth.router);

// Protect other endpoints
app.get("/api/dashboard", auth.authMiddleware, (req, res) => {
    res.json({ message: `Hello, ${req.user.name}!`, currentSessionId: req.sessionId });
});
```

---

## Built-in API Endpoints

| Endpoint | Method | Description | Auth Required | Request Body / Params |
| :--- | :--- | :--- | :--- | :--- |
| `/register` | `POST` | Registers a new user and fires `onVerifyEmail` event. | No | `{ email, password }` |
| `/verify-email/:token` | `GET` | Validates token, marks verified, sets cookie, returns access token. | No | `/:token` |
| `/login` | `POST` | Authenticates email/password. Sets Refresh Cookie, returns Access Token. | No | `{ email, password }` |
| `/refresh` | `POST` | Rotates refresh token. Generates new access token and rotated cookie. | No | *Requires Refresh Cookie* |
| `/logout` | `POST` | Invalidates active refresh token, clears authentication cookies. | Yes | *Requires Refresh Cookie* |
| `/forgot-password` | `POST` | Generates reset token and fires `onForgotPassword` event. | No | `{ email }` |
| `/reset-password/:token` | `POST` | Resets password, invalidates all sessions for this user. | No | `/:token`, `{ password }` |
| `/me` | `GET` | Fetches active authenticated user profile. | Yes | *Requires Bearer Header or Refresh Cookie* |
| `/sessions` | `GET` | Retrieves list of all active sessions for the user. | Yes | *Requires Bearer Header or Refresh Cookie* |
| `/sessions/:id` | `DELETE` | Revokes/Logs out a specific session ID. | Yes | *Requires Bearer Header or Refresh Cookie* |
| `/sessions` | `DELETE` | Revokes all sessions for the user *except* the current one. | Yes | *Requires Bearer Header or Refresh Cookie* |

---

## Verification & Tests

To run the integration test suite:

```bash
node test.js
```

### Coverage Checklist
- [x] Register & Verification
- [x] Login & Password validation
- [x] Invalid password rejection
- [x] Email verification flow
- [x] Refresh token rotation (RTR)
- [x] Replay / Reuse attack detection & auto-revocation
- [x] Logout (Session termination)
- [x] Specific device session revocation
- [x] Logout other sessions (Logout everywhere else)
- [x] Concurrency grace window checks
- [x] Middleware route protection (Bearer Access Token check & cookie fallbacks)

---

## Roadmap

- [x] Refresh Token Rotation (RTR)
- [x] Replay Attack Detection
- [x] Multi-Device Session Management
- [x] Storage Adapter Interface
- [x] Mongoose Storage Adapter
- [x] Concurrency Grace Period

### Planned Features
- [ ] Redis Session Storage Adapter
- [ ] Prisma Storage Adapter
- [ ] Built-in API Rate Limiting
- [ ] JWT Key Rotation (kid support)
- [ ] OAuth Provider Lifecycle Hooks

---

## Philosophy

`@notesify/auth` is intentionally designed as an **authentication engine**, not simply a collection of Express routes.

The goal is to keep authentication modular, reusable, storage-independent, event-driven, and security-focused while allowing applications to integrate their own persistence, notification, and business logic layers without modifying the authentication core.
