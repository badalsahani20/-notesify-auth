import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
    sessionId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true, 
        ref: "User" 
    },
    tokenHash: { 
        type: String, 
        required: true 
    },
    userAgent: { 
        type: String 
    },
    ip: { 
        type: String 
    },
    device: { 
        type: String 
    },
    os: { 
        type: String 
    },
    browser: { 
        type: String 
    },
    lastUsedAt: { 
        type: Date, 
        default: Date.now 
    },
    expiresAt: { 
        type: Date, 
        required: true 
    },
    revokedAt: { 
        type: Date 
    },
    reuseDetectedAt: { 
        type: Date 
    },
    previousTokenHash: {
        type: String
    },
    rotatedAt: {
        type: Date
    }
}, { timestamps: true });

// TTL expiration index managed by MongoDB
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Indexes to speed up lookups
sessionSchema.index({ userId: 1 });

const AuthSession = mongoose.model("AuthSession", sessionSchema);

export default AuthSession;
