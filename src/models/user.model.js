import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: false, 
        unique: false, 
        trim: true 
    },      
    email: { 
        type: String, 
        required: [true, "email is required"], 
        unique: true, 
        lowercase: true, 
        trim: true 
    },
    password: { 
        type: String, 
        select: false, 
        required: function () { return this.provider === "local"; },
        minlength: [6, "Password must be at least 6 characters"],
        default: undefined
    },
    googleId: {
        type: String, 
        default: undefined
    },
    provider: {
        type: String, 
        enum: ["local", "google"], 
        default: "local"
    },
    refreshToken: [
        {
            token: {
                type: String,
                required: true,
            },
            createdAt: {
                type: Date,
                default: Date.now,
            }
        },
    ],
    forgotPasswordToken: {type: String, select: false },
    forgotPasswordExpiry: {type: Date, select: false },
    isVerified: {
        type: Boolean,
        default: false,
    },
    verificationToken: { type: String, select: false },
    verificationTokenExpiry: { type: Date, select: false },
    
    
}, { timestamps: true });

userSchema.index(
    {googleId: 1 },
    {
        unique: true,
        partialFilterExpression: { googleId: {$type: "string"} },
    }
);

userSchema.pre("save", async function() {
    if(!this.isModified("password") || !this.password) return;

    // Check if the password is already a bcrypt hash to prevent double-hashing
    if (this.password.startsWith("$2a$") || this.password.startsWith("$2b$")) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {id: this._id},
        process.env.ACCESS_SECRET,
        { expiresIn: process.env.ACCESS_EXPIRE || "1h" }
    );
};

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {id: this._id},
        process.env.REFRESH_SECRET,
        { expiresIn: process.env.REFRESH_EXPIRE || "7d" }
    )
}

userSchema.methods.comparePassword = async function (candidatePassword)  {
    if(!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
}

const User = mongoose.model("User", userSchema);

export default User;