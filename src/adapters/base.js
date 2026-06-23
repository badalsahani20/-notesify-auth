export class BaseStorageAdapter {
    /**
     * Find a user by their ID
     * @param {string} id 
     * @returns {Promise<any>}
     */
    async findUserById(id) {
        throw new Error("Method 'findUserById' must be implemented");
    }

    /**
     * Create a new user record
     * @param {object} userData 
     * @returns {Promise<any>}
     */
    async createUser(userData) {
        throw new Error("Method 'createUser' must be implemented");
    }

    /**
     * Find a user by their email
     * @param {string} email 
     * @returns {Promise<any>}
     */
    async findUserByEmail(email) {
        throw new Error("Method 'findUserByEmail' must be implemented");
    }

    /**
     * Save/Update a user document/record
     * @param {any} user 
     * @returns {Promise<any>}
     */
    async updateUser(user) {
        throw new Error("Method 'updateUser' must be implemented");
    }

    /**
     * Create a new user session record
     * @param {object} sessionData 
     * @returns {Promise<any>}
     */
    async createSession(sessionData) {
        throw new Error("Method 'createSession' must be implemented");
    }

    /**
     * Find a session by its unique ID
     * @param {string} sessionId 
     * @returns {Promise<any>}
     */
    async findSessionById(sessionId) {
        throw new Error("Method 'findSessionById' must be implemented");
    }

    /**
     * Update/Save session record
     * @param {any} session 
     * @returns {Promise<any>}
     */
    async updateSession(session) {
        throw new Error("Method 'updateSession' must be implemented");
    }

    /**
     * Delete/Revoke a single session by its ID
     * @param {string} sessionId 
     * @returns {Promise<boolean>}
     */
    async deleteSessionById(sessionId) {
        throw new Error("Method 'deleteSessionById' must be implemented");
    }

    /**
     * Delete/Revoke all sessions for a user, optionally keeping one active
     * @param {string} userId 
     * @param {string} [exceptSessionId] 
     * @returns {Promise<number>}
     */
    async deleteAllUserSessions(userId, exceptSessionId) {
        throw new Error("Method 'deleteAllUserSessions' must be implemented");
    }

    /**
     * Get all active sessions for a user
     * @param {string} userId 
     * @returns {Promise<any[]>}
     */
    async findSessionsByUserId(userId) {
        throw new Error("Method 'findSessionsByUserId' must be implemented");
    }
}
