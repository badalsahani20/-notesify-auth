import User from "../models/user.model.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export const createUser = async (userData) => {
    //Check for duplicates
    const existingUser = await User.findOne({ email: userData.email });
    if(existingUser) {
        const error = new Error ("Email already exists, please login")
        error.statusCode = 400;
        throw error;
    }

    //Data logic
    //1. Generate the verification token first
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");

    const user = await User.create({
        ...userData,
        verificationToken: hashedToken,
        verificationTokenExpiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        provider: "local",
        isVerified: false,
    });

    return { user, verificationToken };
};

export const verifyUserEmail = async (token) => {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
        verificationToken: hashedToken,
        verificationTokenExpiry: { $gt: Date.now() },
    });

    if(!user) {
        const error = new Error("Link is invalid or has expired");
        error.statusCode = 400;
        throw error;
    }

    //Mark as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    const hashedRefreshToken = hashRefreshToken(refreshToken);

    user.refreshToken.push({ token: hashedRefreshToken });
    if(user.refreshToken.length > 5) {
        user.refreshToken = user.refreshToken.slice(-5);
    }

    await user.save();

    return {user, accessToken, refreshToken };
}

export const loginUser = async (email, password) => {
    const user = await User.findOne({email}).select("+password +verificationToken");

    if(!user) {
        const error = new Error("Invalid Credentials");
        error.statusCode = 400;
        throw error;
    }
    
    if(!user.password && user.provider === "google") {
        const error = new Error("This account was created using google. Please login in with Google.");
        error.statusCode = 400;
        throw error;
    }

    if(!user.isVerified) {
       const error = new Error("Please verify your email address before logging in");
       error.statusCode = 400;
       throw error;
    }

    const isMatch = await user.comparePassword(password);
    if(!isMatch) {
        const error = new Error("Invalid credentials");
        error.statusCode = 400;
        throw error;
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    const hashedRefreshToken = hashRefreshToken(refreshToken);

    //Add new token and keep only last 5
    user.refreshToken.push({ token: hashedRefreshToken });
    if(user.refreshToken.length > 5) {
        user.refreshToken = user.refreshToken.slice(-5);
    }

    await user.save();

    return { user, accessToken, refreshToken };
}

export const refreshAccessToken = async (refreshTokenFromCookie) => {
    if(!refreshTokenFromCookie) {
        const error = new Error("No refresh Token provided");
        error.statusCode = 401;
        throw error;
    }

    let decoded;

    try{
        decoded = jwt.verify(refreshTokenFromCookie, process.env.REFRESH_SECRET);
    }catch (error) {
        const err = new Error("Invalid refresh token");
        err.statusCode = 401;
        throw err;
    }

    const user = await User.findById(decoded.id);

    if(!user) {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
    }

    const hashedToken = hashRefreshToken(refreshTokenFromCookie);

    const tokenExists = user.refreshToken.some(
        (t) => t.token === hashedToken
    );

    if(!tokenExists) {
        await User.updateOne({ _id: user._id }, {$set: { refreshToken: [] }});

        const error = new Error("Refresh token reuse detected, Revoking sessions");
        error.statusCode = 403;
        throw error;
    }

    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();
    const newHashedToken = hashRefreshToken(newRefreshToken);
    const rotatedTokens = [ ...user.refreshToken.filter((t) => t.token !== hashedToken), { token: newHashedToken }].slice(-5);

    const rotationResult = await User.updateOne(
        { _id: user._id, "refreshToken.token" : hashedToken },
        { $set: { refreshToken: rotatedTokens }}
    );

    if(rotationResult.modifiedCount === 0) {
        const error = new Error("Refresh Token already rotated");
        error.statusCode = 401;
        throw error;
    }

    return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}


export const logOutUser = async (refreshTokenFromCookie) => {
    if(!refreshTokenFromCookie) {
        const error = new Error("No refresh token provided");
        error.statusCode = 400;
        throw error;
    }

    const hashedToken = hashRefreshToken(refreshTokenFromCookie);

    await User.updateOne(
        { "refreshToken.token" : hashedToken },
        { $pull: { refreshToken: { token: hashedToken }}}
    );
};

export const getUserById = async (userId) => {
    const user = await User.findById(userId).select("-password");
    if(!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }
    return user;
}

export const findOrCreateGoogleUser = async (profile) => {
    const email = profile?.emails[0]?.value;

    if(!email) {
        throw new Error("Google account did not provided an email");
    }

    let user = await User.findOne({
        $or: [
            { googleId: profile.id },
            { email }
        ]
    });

    if(!user) {
        user = await User.create({
            googleId: profile.id,
            email,
            name: profile.displayName || email.split("@")[0],
            avatar: profile.photos?.[0]?.value || "",
            provider: "google",
            isVerified: true,
        })
    }else if(!user.googleId) {
        //Existing email user linking google account
        user.googleId = profile.id;
        user.provider = "google";
        if(!user.name) {
            user.name = profile.displayName || email.split("@")[0];
        }
        if(!user.avatar) {
            user.avatar = profile.photos?.[0]?.value || "";
        }

        user.isVerified = true;
        await user.save();
    }

    // if an existing user log in but their name is still empty
    if (user && !user.name) {
        user.name = profile.displayName || email.split("@")[0];
        await user.save();
    }

    // retroactively pull the google avatar if they never had one before
    if (user && !user.avatar && profile.photos?.[0]?.value) {
        user.avatar = profile.photos[0].value;
        await user.save();
    }

    // Ensure any successful Google login marks the user as verified
    if (user && !user.isVerified) {
        user.isVerified = true;
        await user.save();
    }

    return user;
}

export const generatePasswordResetToken = async (email) => {
    const user = await User.findOne({email});

    if(!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    //Generate plain text token
    const resetToken = crypto.randomBytes(20).toString("hex");

    //Generate hashed Token to store in DB
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.forgotPasswordToken = hashedToken;
    user.forgotPasswordExpiry = Date.now() + 15 * 60 * 1000;

    await user.save();
    return resetToken;
}

export const resetUserPassword = async (token, newPassword) => {
    //Hash the incoming plain text token to compare
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    //Find user with valid token and not expired one
    const user = await User.findOne({
        forgotPasswordToken: hashedToken,
        forgotPasswordExpiry: { $gt: Date.now() },
    });

    if(!user) {
        const error = new Error("Token is invalid or has expired");
        error.statusCode = 400;
        throw error;
    }

    //Update password (pre save hook will hash this)
    user.password = newPassword;
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;

    user.refreshToken = [];

    await user.save();

    return user;
}


export const handleGoogleLogin = async (CODEBUILD, config) => {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x www-form0urlencoded"
        },
        body: new URLSearchParams({
            code, 
            client_id: config.googleClientId,
            client_secret: config.googleClientSecret,
            redirect_uri: config.googleRedirectYUri,
            grant_type: "authorization_code", 
        }),
    });

    const tokenData = await tokenResponse.json();

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.accessToken}`},
    });

    const googleProfile = await profileResponse.json();

    const user = await findOrCreateGoogleUser({
        id: googleProfile.sub,
        displayName: googleProfile.name,
        emails: [{ value: googleProfile.email }],
        photos: [{ value: googleProfile.picture }]
    });

    return user;
}