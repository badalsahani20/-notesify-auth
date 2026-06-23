# @notesify/auth

<!-- Badges -->
![NPM Version](https://img.shields.io/badge/npm-v1.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![TypeScript](https://img.shields.io/badge/types-TypeScript-blue?style=flat-square)
![Tests Status](https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)
![Downloads](https://img.shields.io/badge/downloads-10k%2B-blue?style=flat-square)

---

Modern web authentication is far more than just generating JWTs. 

To meet production security standards, modern applications need:
* 📱 **Multi-device Login** (session tracking across different devices).
* ⚙️ **Session Management** (active session lists and audits).
* 🔄 **Refresh Token Rotation (RTR)** (invalidating old refresh credentials).
* 🚨 **Replay Attack Detection** (automatic session revocation on token reuse).
* 🔍 **Device Auditing** (parsing Browser, OS, IP, and location context).
* 🚪 **Logout Everywhere** (remote session invalidation).

`@notesify/auth` provides all of these capabilities out of the box through a modular, database-agnostic, and event-driven architecture.

---

## Architecture Design

```mermaid
flowchart TD
    client[User Client] -->|API Requests| createAuth["createAuth() Factory"]
    createAuth --> router[Express Router]
    createAuth --> adapter[Storage Adapter]
    createAuth --> events[Event Hooks]
    
    adapter -->|State Audit| sessionDB[(AuthSession DB)]
    events -->|Notify| notifyService[Mail / SMS Services]
```

### Refresh Token Rotation (RTR) & Replay Mitigation

```mermaid
sequenceDiagram
    autonumber
    actor Client as User Client
    participant App as Express App
    participant Auth as @notesify/auth
    participant DB as Database (AuthSession)

    Client->>App: POST /login (Credentials)
    App->>Auth: Validate Credentials
    Auth->>DB: Create Session (Store tokenHash, sessionId, UA, IP)
    Auth-->>Client: Access Token (15m JSON) & Refresh Token (7d HttpOnly Cookie)
    
    Note over Client, DB: Token Rotation & Replay Mitigation
    Client->>App: POST /refresh (Presents Refresh Cookie)
    App->>Auth: Validate Token & Lookup Session
    Auth->>DB: Compare tokenHash
    alt Token Hash Matches
        Auth->>DB: Update Session with Rotated tokenHash & Updated Metadata
        Auth-->>Client: New Access Token & New Rotated Refresh Cookie
    else Token Hash Reused (Breach Detected!)
        Note over Auth, DB: Replay Attack Detected: Token already rotated
        Auth->>DB: Revoke all active sessions for User
        Auth-->>Client: 401 Unauthorized (Force Re-login)
    end
```

---

## Why This Architecture?

Experienced backend engineers prioritize clear design patterns and trade-offs. Here is the rationale behind `@notesify/auth`:

### 1. Why separate `AuthSession`?
* **Separation of Concerns**: Storing session tokens inside an array on the main `User` document leads to document bloating, slow index lookups, and exceeds MongoDB's 16MB document size limit for high-activity accounts.
* **Independent TTL Cleanup**: By storing sessions separately, database engines can use high-efficiency TTL (Time-To-Live) indexes to automatically clean up expired sessions without locking the `User` collection.
* **Device Audit Trails**: Storing metadata (IP, OS, Browser, activity) separately makes it easy to support account activity dashboards and specific session revocation.

### 2. Why use a `StorageAdapter`?
* **Database Independence**: The core authentication controllers and middlewares are completely decoupled from database models. 
* **Seamless Field Mapping**: Developers can plug in their existing User models without modifying schema keys (e.g. mapping `email` vs. `primaryEmail`).
* **Testability**: Decoupling allows for mock database adapters during unit testing, preventing external database dependencies in test environments.

### 3. Why use Refresh Token Rotation (RTR)?
* **Replay Attack Mitigation**: If a refresh token is stolen, the attacker can only use it once. The moment either the legitimate user or the attacker attempts to reuse a rotated token, all sessions are immediately invalidated.
* **Constant-Time Verification**: All token comparisons use constant-time evaluations (`timingSafeCompare`) to shield the server from side-channel timing analysis attacks.
* **Concurrency Grace Period**: Network delays can trigger duplicate refresh requests. The library implements a configurable concurrency grace period (default 10s) to tolerate lag without logging users out by mistake.

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

// Initialize the Mongoose Storage Adapter with Custom Field Mapping
const adapter = new MongooseStorageAdapter({
    userModel: User,
    sessionModel: AuthSession,
    fields: {
        email: "email",                  // Maps abstract fields to your actual schema fields
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
            // Trigger email dispatch (Nodemailer, SendGrid, Resend, etc.)
            console.log(`Verification link: ${verificationUrl}`);
        },
        onForgotPassword: async ({ user, resetUrl }) => {
            // Trigger password reset email dispatch
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

## Built-in Device & Session Management

The library provides built-in endpoints for device auditing and session control. Once routes are mounted (e.g., under `/api/auth`), these routes become available automatically:

### 1. `GET /sessions`
Returns a list of all active sessions for the logged-in user with parsed User-Agent strings.
* **Response**:
```json
{
  "success": true,
  "sessions": [
    {
      "id": "6856af09-f808-47c5-ba59-194452ca13ec",
      "device": "Desktop",
      "os": "macOS",
      "browser": "Safari",
      "ip": "127.0.0.1",
      "lastUsedAt": "2026-06-23T16:22:50.000Z",
      "current": true
    },
    {
      "id": "f2fa6c78-f808-47c5-ba59-194452ca13ec",
      "device": "Mobile",
      "os": "iOS",
      "browser": "Chrome",
      "ip": "192.168.1.10",
      "lastUsedAt": "2026-06-23T15:10:00.000Z",
      "current": false
    }
  ]
}
```

### 2. `DELETE /sessions/:id`
Terminates a specific session, logging out that device.

### 3. `DELETE /sessions`
Terminates all sessions for the user *except* the currently active one (Logout other devices).

---

## Security Guarantees

- **Hashed Passwords**: Auto-hashed on register via `bcrypt` (10 rounds).
- **Hashed Session Keys**: Refresh tokens are stored as SHA-256 hashes in the database to prevent plain-text hijacking on db compromise.
- **Timing-Safe Password Checks**: Constant-time string matching prevents database and password timing attacks.
- **HttpOnly Cookies**: Prevents client-side scripts (XSS) from reading the refresh token.
- **SameSite Protection**: Configurable SameSite cookie policy prevents Cross-Site Request Forgery (CSRF).
- **Automated Replay Protection**: Refresh Token Rotation tracks old tokens. If an old token is resubmitted, the library assumes a theft breach and invalidates *all* sessions for that user instantly.
- **Auto-Cleanup (TTL)**: Sessions automatically expire and are purged by MongoDB's background TTL index matching the `expiresAt` parameter.

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
