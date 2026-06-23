import { Router, Request, Response, NextFunction } from "express";
import { Model } from "mongoose";

export interface FeatureOptions {
    emailVerification?: boolean;
    forgotPassword?: boolean;
    refreshRotation?: boolean;
    multiSession?: boolean;
}

export interface CookieOptions {
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
}

export interface EventOptions {
    onVerifyEmail?: (data: { user: any; verificationUrl: string }) => Promise<void> | void;
    onVerifyEmailSuccess?: (data: { user: any; session: any }) => Promise<void> | void;
    onLogin?: (data: { user: any; session: any }) => Promise<void> | void;
    onForgotPassword?: (data: { user: any; resetUrl: string }) => Promise<void> | void;
    onPasswordReset?: (data: { user: any }) => Promise<void> | void;
}

export interface AuthOptions {
    adapter: BaseStorageAdapter;
    accessSecret: string;
    refreshSecret: string;
    accessExpiry?: string | number;
    refreshExpiry?: string | number;
    features?: FeatureOptions;
    cookie?: CookieOptions;
    events?: EventOptions;
}

export interface AuthInstance {
    router: Router;
    authMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
    controllers: {
        register: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        verifyEmail: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        login: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        refresh: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        logout: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        forgotPassword: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        resetPassword: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        getMe: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        getSessions: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        deleteSession: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
        deleteAllSessions: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
    };
}

export abstract class BaseStorageAdapter {
    findUserById(id: string): Promise<any>;
    createUser(userData: any): Promise<any>;
    findUserByEmail(email: string): Promise<any>;
    updateUser(user: any): Promise<any>;
    
    createSession(sessionData: any): Promise<any>;
    findSessionById(sessionId: string): Promise<any>;
    updateSession(session: any): Promise<any>;
    deleteSessionById(sessionId: string): Promise<boolean>;
    deleteAllUserSessions(userId: string, exceptSessionId?: string): Promise<number>;
    findSessionsByUserId(userId: string): Promise<any[]>;
}

export interface MongooseAdapterConfig {
    userModel: Model<any>;
    sessionModel: Model<any>;
    fields?: {
        email?: string;
        password?: string;
        isVerified?: string;
        verificationToken?: string;
        verificationTokenExpiry?: string;
        forgotPasswordToken?: string;
        forgotPasswordExpiry?: string;
    };
}

export class MongooseStorageAdapter extends BaseStorageAdapter {
    constructor(config: MongooseAdapterConfig);
    getFieldName(key: string): string;
    getUserField(user: any, key: string): any;
    setUserField(user: any, key: string, value: any): void;
}

export function createAuth(options: AuthOptions): AuthInstance;
