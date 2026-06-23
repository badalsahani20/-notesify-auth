import express from "express";
import { 
    registerUser, 
    verifyEmail, 
    loginUser, 
    refreshToken, 
    logOutUser, 
    googleCallback, 
    exchangeCode, 
    forgotPassword, 
    resetPassword, 
    getMe 
} from "../controllers/auth.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

// Local Auth
router.post("/register", registerUser);
router.get("/verify-email/:token", verifyEmail);
router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/logout", logOutUser);

// Password Reset
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Google OAuth
router.get("/google/callback", googleCallback);
router.post("/exchange-code", exchangeCode);

// Profile (Protected Route)
router.get("/me", authMiddleware, getMe);

export default router;
