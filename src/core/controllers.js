import jwt from "jsonwebtoken";
import { 
    hashPassword, 
    comparePassword, 
    hashToken, 
    generateRandomToken, 
    generateSessionId,
    timingSafeCompare 
} from "../utils/crypto.js";
import { parseUserAgent } from "../utils/ua.js";

// Helper to convert MS format string (e.g. "15m", "7d") to milliseconds
function parseDuration(duration) {
    if (typeof duration === "number") return duration;
    if (typeof duration !== "string") return 0;
    
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 0;
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60000;
        case 'h': return value * 3600000;
        case 'd': return value * 86400000;
        default: return 0;
    }
}

// Wrapper for controller errors
const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export function createControllers(config) {
    const { 
        adapter, 
        accessSecret, 
        refreshSecret, 
        accessExpiry = "15m", 
        refreshExpiry = "7d", 
        cookie = {}, 
        events = {}, 
        features = {} 
    } = config;

    const getRefreshCookieOptions = (expiresAt) => ({
        httpOnly: true,
        secure: cookie.secure ?? (process.env.NODE_ENV === "production"),
        sameSite: cookie.sameSite ?? "lax",
        path: "/",
        expires: expiresAt
    });

    const getRefreshCookieClearOptions = () => ({
        httpOnly: true,
        secure: cookie.secure ?? (process.env.NODE_ENV === "production"),
        sameSite: cookie.sameSite ?? "lax",
        path: "/"
    });

    const generateAccessToken = (userId, sessionId) => {
        return jwt.sign({ id: userId, sessionId }, accessSecret, { expiresIn: accessExpiry });
    };

    const generateRefreshToken = (userId, sessionId) => {
        return jwt.sign({ id: userId, sessionId }, refreshSecret, { expiresIn: refreshExpiry });
    };

    const register = catchAsync(async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password" });
        }

        const existingUser = await adapter.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        const hashedPassword = await hashPassword(password);
        const userData = {
            ...req.body,
            password: hashedPassword
        };

        if (features.emailVerification) {
            const verificationToken = generateRandomToken();
            const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours
            userData.isVerified = false;
            userData.verificationToken = verificationToken;
            userData.verificationTokenExpiry = verificationTokenExpiry;
        } else {
            userData.isVerified = true;
        }

        const user = await adapter.createUser(userData);

        if (features.emailVerification) {
            const verificationUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email/${userData.verificationToken}`;
            if (events.onVerifyEmail) {
                await events.onVerifyEmail({ user, verificationUrl });
            }
        }

        res.status(201).json({
            success: true,
            message: features.emailVerification 
                ? "Registration successful. Please verify your email." 
                : "Registration successful.",
            user: {
                id: user._id,
                email: adapter.getUserField(user, "email"),
                isVerified: adapter.getUserField(user, "isVerified")
            },
            // For testing environments, return dev token if verification is active
            ...(process.env.NODE_ENV !== "production" && features.emailVerification && { 
                devVerificationToken: userData.verificationToken 
            })
        });
    });

    const verifyEmail = catchAsync(async (req, res) => {
        const { token } = req.params;
        if (!token) {
            return res.status(400).json({ message: "Verification token is required" });
        }

        // Fetch all fields for validation
        const user = await adapter.userModel.findOne({ 
            [adapter.getFieldName("verificationToken")]: token 
        }).select(`+${adapter.getFieldName("verificationToken")} +${adapter.getFieldName("verificationTokenExpiry")} +${adapter.getFieldName("isVerified")}`);

        if (!user) {
            return res.status(400).json({ message: "Invalid verification token" });
        }

        const expiry = user[adapter.getFieldName("verificationTokenExpiry")];
        if (expiry && new Date() > new Date(expiry)) {
            return res.status(400).json({ message: "Verification token has expired" });
        }

        adapter.setUserField(user, "isVerified", true);
        adapter.setUserField(user, "verificationToken", undefined);
        adapter.setUserField(user, "verificationTokenExpiry", undefined);
        await adapter.updateUser(user);

        // Generate session
        const sessionId = generateSessionId();
        const accessToken = generateAccessToken(user._id.toString(), sessionId);
        const refreshToken = generateRefreshToken(user._id.toString(), sessionId);
        const hashedRefreshToken = hashToken(refreshToken);

        const expiresAt = new Date(Date.now() + parseDuration(refreshExpiry));
        const uaInfo = parseUserAgent(req.headers["user-agent"]);

        const session = await adapter.createSession({
            sessionId,
            userId: user._id,
            tokenHash: hashedRefreshToken,
            userAgent: req.headers["user-agent"],
            ip: req.ip,
            ...uaInfo,
            expiresAt
        });

        if (events.onVerifyEmailSuccess) {
            await events.onVerifyEmailSuccess({ user, session });
        }

        res.cookie("refreshToken", refreshToken, getRefreshCookieOptions(expiresAt));
        res.status(200).json({
            success: true,
            message: "Email verified successfully.",
            accessToken,
            user: {
                id: user._id,
                email: adapter.getUserField(user, "email"),
                isVerified: true
            }
        });
    });

    const login = catchAsync(async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password" });
        }

        const user = await adapter.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isPasswordCorrect = await comparePassword(password, adapter.getUserField(user, "password"));
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (features.emailVerification && !adapter.getUserField(user, "isVerified")) {
            return res.status(403).json({ message: "Please verify your email address first" });
        }

        // Generate session
        const sessionId = generateSessionId();
        const accessToken = generateAccessToken(user._id.toString(), sessionId);
        const refreshToken = generateRefreshToken(user._id.toString(), sessionId);
        const hashedRefreshToken = hashToken(refreshToken);

        const expiresAt = new Date(Date.now() + parseDuration(refreshExpiry));
        const uaInfo = parseUserAgent(req.headers["user-agent"]);

        const session = await adapter.createSession({
            sessionId,
            userId: user._id,
            tokenHash: hashedRefreshToken,
            userAgent: req.headers["user-agent"],
            ip: req.ip,
            ...uaInfo,
            expiresAt
        });

        if (events.onLogin) {
            await events.onLogin({ user, session });
        }

        res.cookie("refreshToken", refreshToken, getRefreshCookieOptions(expiresAt));
        res.status(200).json({
            success: true,
            accessToken,
            user: {
                id: user._id,
                email: adapter.getUserField(user, "email"),
                isVerified: adapter.getUserField(user, "isVerified")
            }
        });
    });

    const refresh = catchAsync(async (req, res) => {
        const token = req.cookies.refreshToken;
        if (!token) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, refreshSecret);
        } catch (err) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const session = await adapter.findSessionById(decoded.sessionId);
        const inputHash = hashToken(token);

        // 1. Session is not found: Either expired or deleted
        if (!session) {
            return res.status(401).json({ message: "Session expired or invalid" });
        }

        // 2. Refresh Token Rotation (RTR) - Breach / Reuse Detection
        // if (!timingSafeCompare(session.tokenHash, inputHash)) {
        //     // A reuse is detected! This token hash was already rotated.
        //     // Revoke ALL active sessions for this user immediately for security.
        //     await adapter.deleteAllUserSessions(session.userId);
        //     res.clearCookie("refreshToken", getRefreshCookieClearOptions());
        //     return res.status(401).json({ 
        //         message: "Security breach detected: Refresh token reused. All sessions revoked." 
        //     });
        // }
        if(timingSafeCompare(session.tokenHash, inputHash)) {
            const newAccessToken = generateAccessToken(session.userId.toString(), session.sessionId);
            const newRefreshToken = generateRefreshToken(session.userId.toString(), session.sessionId);
            const newHashedToken = hashToken(newRefreshToken);
            const newExpiresAt = new Date(Date.now() + parseDuration(refreshExpiry));
            //Save active hash as previous token and set rotation timestamp
            session.previousTokenHash = session.tokenHash;
            session.rotatedAt = new Date(); 

            session.tokenHash = newHashedToken;
            session.lastUsedAt = new Date();
            session.expiresAt = newExpiresAt;
            session.ip = req.ip;
            session.userAgent = req.headers["user-agent"];

            const uaInfo = parseUserAgent(req.headers["user-agent"]);
            Object.assign(session, uaInfo);

            await adapter.updateSession(session);

            res.cookie("refreshToken", newRefreshToken, getRefreshCookieOptions(newExpiresAt));
            return res.status(200).json({
                success: true,
                accessToken: newAccessToken
            });
        }

        // 3. Generate rotated credentials
        // const newAccessToken = generateAccessToken(session.userId.toString(), session.sessionId);
        // const newRefreshToken = generateRefreshToken(session.userId.toString(), session.sessionId);
        // const newHashedToken = hashToken(newRefreshToken);

        // const newExpiresAt = new Date(Date.now() + parseDuration(refreshExpiry));

        // // Update session with new hash and updated times
        // session.tokenHash = newHashedToken;
        // session.lastUsedAt = new Date();
        // session.expiresAt = newExpiresAt;
        // session.ip = req.ip;
        // session.userAgent = req.headers["user-agent"];
        
        // // Update user agent info if changed
        // const uaInfo = parseUserAgent(req.headers["user-agent"]);
        // Object.assign(session, uaInfo);

        // await adapter.updateSession(session);

        if(session.previousTokenHash && timingSafeCompare(session.previousTokenHash, inputHash)) {
            const gracePeriod = config.gracePeriod ?? 10000; // 10 secs validation window
            const timeSinceRotation = Date.now() - new Date(session.rotatedAt).getTime();

            if(timeSinceRotation < gracePeriod) {
                const newAccessToken = generateAccessToken(session.userId.toString(), session.sessionId);
                return res.status(200).json({
                    success: true,
                    accessToken: newAccessToken
                });
            }
        }

        await adapter.deleteAllUserSessions(session.userId);
        res.clearCookie("refreshToken", getRefreshCookieClearOptions());
        return res.status(401).json({
            message: "Security breach detected: RefreshToken reused. All sessions revoked."
        });
    });

    const logout = catchAsync(async (req, res) => {
        const token = req.cookies.refreshToken;
        if (token) {
            try {
                const decoded = jwt.verify(token, refreshSecret);
                await adapter.deleteSessionById(decoded.sessionId);
            } catch (err) {
                // Ignore decoding errors on logout
            }
        }
        res.clearCookie("refreshToken", getRefreshCookieClearOptions());
        res.status(200).json({ success: true, message: "Logged out successfully" });
    });

    const forgotPassword = catchAsync(async (req, res) => {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await adapter.findUserByEmail(email);
        if (!user) {
            // Mitigate user enumeration by returning 200 regardless
            return res.status(200).json({ 
                success: true, 
                message: "If the email is registered, a password reset link will be sent." 
            });
        }

        const resetToken = generateRandomToken();
        const resetExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 Hour

        adapter.setUserField(user, "forgotPasswordToken", resetToken);
        adapter.setUserField(user, "forgotPasswordExpiry", resetExpiry);
        await adapter.updateUser(user);

        const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;
        
        if (events.onForgotPassword) {
            await events.onForgotPassword({ user, resetUrl });
        }

        res.status(200).json({
            success: true,
            message: "If the email is registered, a password reset link will be sent.",
            // Export token in dev mode
            ...(process.env.NODE_ENV !== "production" && { devResetToken: resetToken })
        });
    });

    const resetPassword = catchAsync(async (req, res) => {
        const { token } = req.params;
        const { password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: "Token and password are required" });
        }

        const user = await adapter.userModel.findOne({ 
            [adapter.getFieldName("forgotPasswordToken")]: token 
        }).select(`+${adapter.getFieldName("forgotPasswordToken")} +${adapter.getFieldName("forgotPasswordExpiry")} +${adapter.getFieldName("password")}`);

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        const expiry = user[adapter.getFieldName("forgotPasswordExpiry")];
        if (expiry && new Date() > new Date(expiry)) {
            return res.status(400).json({ message: "Reset token has expired" });
        }

        const newHashedPassword = await hashPassword(password);
        adapter.setUserField(user, "password", newHashedPassword);
        adapter.setUserField(user, "forgotPasswordToken", undefined);
        adapter.setUserField(user, "forgotPasswordExpiry", undefined);
        
        await adapter.updateUser(user);

        // Terminate all active sessions on password change
        await adapter.deleteAllUserSessions(user._id.toString());

        if (events.onPasswordReset) {
            await events.onPasswordReset({ user });
        }

        res.status(200).json({
            success: true,
            message: "Password reset successfully. You can now login with your new password."
        });
    });

    const getMe = catchAsync(async (req, res) => {
        // req.user is populated by authMiddleware
        res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                email: adapter.getUserField(req.user, "email"),
                isVerified: adapter.getUserField(req.user, "isVerified")
            }
        });
    });

    // Session Management Endpoints
    const getSessions = catchAsync(async (req, res) => {
        const userId = req.user._id.toString();
        const activeSessions = await adapter.findSessionsByUserId(userId);
        
        const mappedSessions = activeSessions.map(session => ({
            id: session.sessionId,
            device: session.device || "Unknown Device",
            os: session.os || "Unknown OS",
            browser: session.browser || "Unknown Browser",
            ip: session.ip || "Unknown IP",
            lastUsedAt: session.lastUsedAt,
            current: session.sessionId === req.sessionId
        }));

        res.status(200).json({
            success: true,
            sessions: mappedSessions
        });
    });

    const deleteSession = catchAsync(async (req, res) => {
        const { id } = req.params;
        const userId = req.user._id.toString();

        const session = await adapter.findSessionById(id);
        if (!session || session.userId.toString() !== userId) {
            return res.status(404).json({ message: "Session not found" });
        }

        await adapter.deleteSessionById(id);

        // If user logged out of their CURRENT session, clear their cookie
        if (id === req.sessionId) {
            res.clearCookie("refreshToken", getRefreshCookieClearOptions());
        }

        res.status(200).json({
            success: true,
            message: "Session revoked successfully"
        });
    });

    const deleteAllSessions = catchAsync(async (req, res) => {
        const userId = req.user._id.toString();
        const currentSessionId = req.sessionId;

        // Revoke all sessions except the current active one
        const deletedCount = await adapter.deleteAllUserSessions(userId, currentSessionId);

        res.status(200).json({
            success: true,
            message: `Revoked ${deletedCount} other sessions successfully.`
        });
    });

    return {
        register,
        verifyEmail,
        login,
        refresh,
        logout,
        forgotPassword,
        resetPassword,
        getMe,
        getSessions,
        deleteSession,
        deleteAllSessions
    };
}
