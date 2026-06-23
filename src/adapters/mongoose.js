import { BaseStorageAdapter } from "./base.js";

const defaultFields = {
    email: "email",
    password: "password",
    isVerified: "isVerified",
    verificationToken: "verificationToken",
    verificationTokenExpiry: "verificationTokenExpiry",
    forgotPasswordToken: "forgotPasswordToken",
    forgotPasswordExpiry: "forgotPasswordExpiry"
};

export class MongooseStorageAdapter extends BaseStorageAdapter {
    constructor({ userModel, sessionModel, fields = {} }) {
        super();
        this.userModel = userModel;
        this.sessionModel = sessionModel;
        this.fields = { ...defaultFields, ...fields };
    }

    /**
     * Retrieve the actual key mapped to the abstraction key
     * @param {string} key 
     * @returns {string}
     */
    getFieldName(key) {
        return this.fields[key];
    }

    /**
     * Helper to get a field value dynamically from a user document
     */
    getUserField(user, key) {
        if (!user) return undefined;
        return user[this.fields[key]];
    }

    /**
     * Helper to set a field value dynamically on a user document
     */
    setUserField(user, key, value) {
        if (!user) return;
        user[this.fields[key]] = value;
    }

    async findUserById(id) {
        // Explicitly select hidden security-sensitive fields so they are accessible
        const selectFields = Object.values(this.fields).map(f => `+${f}`).join(" ");
        return await this.userModel.findById(id).select(selectFields);
    }

    async createUser(userData) {
        const mappedData = {};
        // Map configured fields
        for (const [abstractKey, schemaKey] of Object.entries(this.fields)) {
            if (userData[abstractKey] !== undefined) {
                mappedData[schemaKey] = userData[abstractKey];
            }
        }
        // Retain other custom fields passed (e.g. name)
        for (const [key, value] of Object.entries(userData)) {
            if (this.fields[key] === undefined) {
                mappedData[key] = value;
            }
        }
        return await this.userModel.create(mappedData);
    }

    async findUserByEmail(email) {
        const selectFields = Object.values(this.fields).map(f => `+${f}`).join(" ");
        return await this.userModel.findOne({
            [this.fields.email]: email.toLowerCase()
        }).select(selectFields);
    }

    async updateUser(user) {
        return await user.save();
    }

    async createSession(sessionData) {
        return await this.sessionModel.create(sessionData);
    }

    async findSessionById(sessionId) {
        return await this.sessionModel.findOne({ sessionId });
    }

    async updateSession(session) {
        return await session.save();
    }

    async deleteSessionById(sessionId) {
        const res = await this.sessionModel.deleteOne({ sessionId });
        return res.deletedCount > 0;
    }

    async deleteAllUserSessions(userId, exceptSessionId) {
        const query = { userId };
        if (exceptSessionId) {
            query.sessionId = { $ne: exceptSessionId };
        }
        const res = await this.sessionModel.deleteMany(query);
        return res.deletedCount;
    }

    async findSessionsByUserId(userId) {
        return await this.sessionModel.find({ userId }).sort({ lastUsedAt: -1 });
    }
}
