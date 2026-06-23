import jwt from "jsonwebtoken";
import { hashToken } from "../utils/crypto.js";

/**
 * Creates authentication middleware using the config object.
 * @param {object} config 
 * @returns {Function} Express middleware function
 */
export function createMiddleware(config) {
    const { adapter, accessSecret, refreshSecret } = config;

    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        const refreshToken = req.cookies?.refreshToken;

        try {
            // 1. Try Access Token in Authorization Header
            if (authHeader && authHeader.startsWith("Bearer ")) {
                const token = authHeader.split(" ")[1];
                const decoded = jwt.verify(token, accessSecret);

                // Fetch session to verify it has not been revoked/logged out
                const session = await adapter.findSessionById(decoded.sessionId);
                if (!session || session.revokedAt) {
                    return res.status(401).json({ message: "Session has been revoked or expired" });
                }

                const user = await adapter.findUserById(decoded.id);
                if (!user) {
                    return res.status(401).json({ message: "User no longer exists" });
                }

                req.user = user;
                req.sessionId = decoded.sessionId;
                return next();
            }

            // 2. Fallback to Refresh Token Cookie
            if (refreshToken) {
                const decoded = jwt.verify(refreshToken, refreshSecret);
                const hashedRefreshToken = hashToken(refreshToken);

                const session = await adapter.findSessionById(decoded.sessionId);
                
                // Ensure session matches the token hash and is not revoked
                if (!session || session.revokedAt || session.tokenHash !== hashedRefreshToken) {
                    return res.status(401).json({ message: "Invalid or expired session" });
                }

                const user = await adapter.findUserById(decoded.id);
                if (!user) {
                    return res.status(401).json({ message: "User no longer exists" });
                }

                req.user = user;
                req.sessionId = decoded.sessionId;
                return next();
            }

            return res.status(401).json({
                message: "Access token not found, authorization denied"
            });
        } catch (error) {
            return res.status(401).json({
                message: "Invalid or expired token",
                error: process.env.NODE_ENV !== "production" ? error.message : undefined
            });
        }
    };
}
