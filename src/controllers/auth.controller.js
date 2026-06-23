import * as UserService from "../services/user.service.js";
import catchAsync from "../utils/catchAsync.js";
import * as MailService from "../services/mail.service.js"
import { oauthStore } from "../utils/store.js";
import crypto from "crypto";

const getRefreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
});

const getRefreshCookieClearOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", 
});


export const registerUser = catchAsync(async(req, res) => {
    const {name, email, password} = req.body;

    if(!name || !email || !password) {
        return res.status(400).json({ message: "Please provide name, email and password "});
    }

    const {user, verificationToken } = await UserService.createUser({
        name,
        email,
        password,
    });

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;
    await MailService.sendVerificationEmail(email, name, verificationUrl);

    res.status(201).json({
        success: true,
        message: "Registration sucessfull! Please check your console/email to verify your account.",
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            isVerified: user.isVerified,
        },
        ...(process.env.NODE_ENV !== "production" && { devVerificationToken: verificationToken })
    });
});

export const verifyEmail = catchAsync(async(req, res) => {
    const {token} = req.params;
    console.log("Backend Verification started for token:", token);

    const { user, accessToken, refreshToken } = await UserService.verifyUserEmail(token);
    console.log("BACKEND: Verification successful for user:", user.email);

    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());
      res.status(200).json({
        success: true,
        message: "Email verified successfully.",
        accessToken,
        user: { 
            id: user._id, 
            name: user?.name, 
            email: user.email, 
            avatar: user.avatar, 
            isVerified: user.isVerified },
      });
})

export const loginUser = catchAsync(async(req, res) => {
    const { email, password } = req.body;
    if(!email || !password) {
        return res.status(400).json({ message: "Please provice email and password" });
    }

    const { user, accessToken, refreshToken } = await UserService.loginUser(email, password);
    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    res.status(200).json({
        success: true,
        accessToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            isVerified: user.isVerified,
        }
    });
});

export const refreshToken = catchAsync(async (req, res) => {
    const refreshTokenFromCookie = req.cookies.refreshToken;
    const { accessToken, refreshToken, user } = await UserService.refreshAccessToken(refreshTokenFromCookie);

    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    res.status(200).json({
        success: true,
        accessToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            isVerified: user.isVerified,
        }
    });
}); 

export const logOutUser = catchAsync(async(req, res) => {
    const refreshTokenFromCookie = req.cookies.refreshToken;
    await UserService.logOutUser(refreshTokenFromCookie);
    res.clearCookie("refreshToken", getRefreshCookieClearOptions());
    res.json({ message: "Logged out successfully "});
});

export const googleCallback = catchAsync (async(req, res) => {
    const { code } = req.query; //Google sent code

    if(!code) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=Googleauth-failed`);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-type" : "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
        }),
    });
    const tokenData = await tokenResponse.json();
    if(tokenData.error) {
        throw new Error(`Google Token Exchange Error: ${tokenData.error_description}`);
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleProfile = await profileResponse.json();

    const normalizedProfile = {
        id: googleProfile.sub,
        displayName: googleProfile.name,
        emails: [{ value: googleProfile.email }],
        photos: [{ value: googleProfile.picture }]
    };

    const user = await UserService.findOrCreateGoogleUser(normalizedProfile);
    const tempCode = crypto.randomBytes(32).toString("hex");
    await oauthStore.set(tempCode, user._id.toString(), 60);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/oauth-success?code=${tempCode}`);
});

export const exchangeCode = catchAsync(async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ message: "No exchange code provided" });
    }

    // 1. Verify code in MemoryStore
    const userId = await oauthStore.get(code);
    if (!userId) {
        return res.status(400).json({ message: "Invalid or expired exchange code" });
    }

    // 2. Burn the code immediately so it can't be reused
    await oauthStore.delete(code);

    // 3. Retrieve user & generate tokens
    const user = await UserService.getUserById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // 4. Hash and save the refresh token
    const hashedRefreshToken = crypto.createHash("sha256").update(refreshToken).digest("hex");
    user.refreshToken.push({ token: hashedRefreshToken });
    if (user.refreshToken.length > 5) {
        user.refreshToken = user.refreshToken.slice(-5);
    }
    await user.save();

    // 5. Set HTTP-only cookie and respond
    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());
    res.status(200).json({
        success: true,
        accessToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            isVerified: user.isVerified
        }
    });
});


// 1. Get Me Controller (Fetch profile of currently logged-in user)
export const getMe = catchAsync(async (req, res) => {
    // req.user is attached by the authMiddleware
    const user = await UserService.getUserById(req.user._id);

    res.status(200).json({
        success: true,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            isVerified: user.isVerified,
        },
    });
});

// 2. Forgot Password Controller
export const forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Please provide your email address" });
    }

    // Call service to generate reset token
    const resetToken = await UserService.generatePasswordResetToken(email);

    // Construct the URL and log/send it
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
    await MailService.sendResetPasswordEmail(email, resetUrl);

    res.status(200).json({
        success: true,
        message: "A reset link has been simulated in your console."
    });
});

// 3. Reset Password Controller
export const resetPassword = catchAsync(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: "Please provide your new password" });
    }

    // Call service to update password
    await UserService.resetUserPassword(token, password);

    res.status(200).json({
        success: true,
        message: "Password reset successfully. You can now login with your new password."
    });
});
