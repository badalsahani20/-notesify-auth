class MemoryStore {
    constructor() {
        this.cache = new Map();
    }

    async get(key) {
        return this.cache.get(key);
    }

    async set(key, value, ttlInSeconds = 60) {
        this.cache.set(key, value);
        setTimeout(() => {
            this.cache.delete(key);
        }, ttlInSeconds * 1000);
    }

    async delete(key) {
        return this.cache.delete(key);
    }
}

export const oauthStore = new MemoryStore();