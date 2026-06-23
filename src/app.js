import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import dotenv from "dotenv";
import { createAuth, MongooseStorageAdapter } from "./index.js";
import User from "./models/user.model.js";
import AuthSession from "./models/session.model.js";
import { sendVerificationEmail, sendResetPasswordEmail } from "./services/mail.service.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// 1. Initialize Mongoose Storage Adapter with Custom Field Mappings
const adapter = new MongooseStorageAdapter({
    userModel: User,
    sessionModel: AuthSession,
    fields: {
        email: "email",
        password: "password",
        isVerified: "isVerified",
        verificationToken: "verificationToken",
        verificationTokenExpiry: "verificationTokenExpiry",
        forgotPasswordToken: "forgotPasswordToken",
        forgotPasswordExpiry: "forgotPasswordExpiry"
    }
});

// 2. Initialize Authentication Instance with Event Handlers & Security Options
const auth = createAuth({
    adapter,
    accessSecret: process.env.ACCESS_SECRET,
    refreshSecret: process.env.REFRESH_SECRET,
    gracePeriod: process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" ? 0 : 10000,
    accessExpiry: "15m",
    refreshExpiry: "7d",
    cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    },
    events: {
        onVerifyEmail: async ({ user, verificationUrl }) => {
            const email = adapter.getUserField(user, "email");
            const name = user.name || "User";
            await sendVerificationEmail(email, name, verificationUrl);
        },
        onForgotPassword: async ({ user, resetUrl }) => {
            const email = adapter.getUserField(user, "email");
            await sendResetPasswordEmail(email, resetUrl);
        }
    }
});

// 3. Mount Authentication Routes
app.use("/api/users", auth.router);

export default app;
export { auth };