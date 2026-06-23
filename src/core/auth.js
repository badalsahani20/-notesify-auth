import express from "express";
import { createControllers } from "./controllers.js";
import { createMiddleware } from "./middleware.js";

/**
 * Factory function to initialize the authentication library.
 * @param {object} options Config options
 * @returns {{ router: Router, authMiddleware: Function, controllers: object }}
 */
export function createAuth(options) {
    if (!options.adapter) {
        throw new Error("Storage adapter is required");
    }
    if (!options.accessSecret) {
        throw new Error("accessSecret is required");
    }
    if (!options.refreshSecret) {
        throw new Error("refreshSecret is required");
    }

    // Default features if not specified
    const features = {
        emailVerification: true,
        forgotPassword: true,
        refreshRotation: true,
        multiSession: true,
        ...options.features
    };

    const config = {
        ...options,
        features
    };

    const controllers = createControllers(config);
    const authMiddleware = createMiddleware(config);

    const router = express.Router();

    // 1. Basic Sign Up & Login Endpoints
    router.post("/register", controllers.register);
    router.post("/login", controllers.login);
    router.post("/refresh", controllers.refresh);
    router.post("/logout", controllers.logout);

    // 2. Conditional Email Verification Endpoint
    if (features.emailVerification) {
        router.get("/verify-email/:token", controllers.verifyEmail);
    }

    // 3. Conditional Password Reset Endpoints
    if (features.forgotPassword) {
        router.post("/forgot-password", controllers.forgotPassword);
        router.post("/reset-password/:token", controllers.resetPassword);
    }

    // 4. Authenticated Profile Endpoint
    router.get("/me", authMiddleware, controllers.getMe);

    // 5. Device & Session Management Endpoints
    router.get("/sessions", authMiddleware, controllers.getSessions);
    router.delete("/sessions/:id", authMiddleware, controllers.deleteSession);
    router.delete("/sessions", authMiddleware, controllers.deleteAllSessions);

    return {
        router,
        authMiddleware,
        controllers
    };
}
