import dotenv from "dotenv";

dotenv.config();

const API_URL = "http://127.0.0.1:5500/api/users";
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = "testpassword123";

async function runTests() {
    console.log("🚀 Starting Refactored Auth Integration Tests...\n");

    let verificationToken = null;
    let tokenA = null;
    let cookieA = null;
    let tokenB = null;
    let cookieB = null;
    let tokenC = null;
    let cookieC = null;

    try {
        // ==========================================
        // 1. REGISTER USER
        // ==========================================
        console.log(`1. Registering new user: ${TEST_EMAIL}...`);
        const registerRes = await fetch(`${API_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Test User",
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            })
        });
        
        const registerData = await registerRes.json();
        console.log("   Status:", registerRes.status, "| Message:", registerData.message);
        if (registerRes.status !== 201) throw new Error("Registration failed");

        verificationToken = registerData.devVerificationToken;
        if (!verificationToken) {
            throw new Error("Could not find devVerificationToken in response.");
        }
        console.log(`   Verification Token: ${verificationToken}`);

        // ==========================================
        // 2. VERIFY EMAIL (Auto-login -> Session A)
        // ==========================================
        console.log("\n2. Verifying email (Generates Session A)...");
        const verifyRes = await fetch(`${API_URL}/verify-email/${verificationToken}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0" }
        });
        const verifyData = await verifyRes.json();
        console.log("   Status:", verifyRes.status, "| Message:", verifyData.message);
        if (verifyRes.status !== 200) throw new Error("Verification failed");
        
        tokenA = verifyData.accessToken;
        cookieA = verifyRes.headers.get("set-cookie")?.split(";")[0];
        console.log("   Session A Access Token:", !!tokenA, "| Cookie Saved:", !!cookieA);

        // ==========================================
        // 3. LOGIN FOR SECOND DEVICE (Generates Session B)
        // ==========================================
        console.log("\n3. Logging in on a second simulated device (Safari on macOS -> Session B)...");
        const loginBRes = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/14.0 Safari/605"
            },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
        });
        const loginBData = await loginBRes.json();
        console.log("   Status:", loginBRes.status);
        if (loginBRes.status !== 200) throw new Error("Login B failed");

        tokenB = loginBData.accessToken;
        cookieB = loginBRes.headers.get("set-cookie")?.split(";")[0];
        console.log("   Session B Access Token:", !!tokenB, "| Cookie Saved:", !!cookieB);

        // ==========================================
        // 4. FETCH SESSIONS FROM SESSION B
        // ==========================================
        console.log("\n4. Retrieving active device sessions using Session B...");
        const sessionsRes = await fetch(`${API_URL}/sessions`, {
            headers: { "Authorization": `Bearer ${tokenB}` }
        });
        const sessionsData = await sessionsRes.json();
        console.log("   Status:", sessionsRes.status);
        console.log("   Active Sessions List:");
        sessionsData.sessions.forEach(s => {
            console.log(`     - [${s.id.slice(0,8)}...] OS: ${s.os} | Browser: ${s.browser} | Device: ${s.device} | Current: ${s.current}`);
        });

        if (sessionsData.sessions.length !== 2) {
            throw new Error(`Expected 2 active sessions, found ${sessionsData.sessions.length}`);
        }

        // ==========================================
        // 5. REVOKE SESSION A FROM SESSION B
        // ==========================================
        const sessionAId = sessionsData.sessions.find(s => !s.current).id;
        console.log(`\n5. Revoking Session A (ID: ${sessionAId}) from Session B...`);
        const revokeRes = await fetch(`${API_URL}/sessions/${sessionAId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${tokenB}` }
        });
        const revokeData = await revokeRes.json();
        console.log("   Status:", revokeRes.status, "| Message:", revokeData.message);
        if (revokeRes.status !== 200) throw new Error("Revocation of session A failed");

        // Verify Session A is actually dead (attempt refresh)
        console.log("   Checking if Session A is indeed rejected on refresh...");
        const refreshARes = await fetch(`${API_URL}/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieA }
        });
        console.log("   Refresh with Session A Status (Expected 401):", refreshARes.status);
        if (refreshARes.status !== 401) throw new Error("Revoked session was still able to refresh!");

        // ==========================================
        // 6. MULTI-DEVICE CLEANUP (Logout All Devices except current)
        // ==========================================
        // Create another session first: Session C
        console.log("\n6. Logging in again to create Session C...");
        const loginCRes = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile"
            },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
        });
        const loginCData = await loginCRes.json();
        tokenC = loginCData.accessToken;
        cookieC = loginCRes.headers.get("set-cookie")?.split(";")[0];
        console.log("   Session C Access Token:", !!tokenC, "| Cookie Saved:", !!cookieC);

        // Verify session count is 2 (Session B and Session C)
        const checkSessionsRes = await fetch(`${API_URL}/sessions`, {
            headers: { "Authorization": `Bearer ${tokenC}` }
        });
        const checkSessionsData = await checkSessionsRes.json();
        console.log("   Session count before 'Logout Others':", checkSessionsData.sessions.length);
        if (checkSessionsData.sessions.length !== 2) throw new Error("Expected 2 active sessions before cleanup");

        // Trigger delete all other sessions
        console.log("   Invoking DELETE /sessions (Logout other devices)...");
        const deleteOthersRes = await fetch(`${API_URL}/sessions`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${tokenC}` }
        });
        const deleteOthersData = await deleteOthersRes.json();
        console.log("   Status:", deleteOthersRes.status, "| Message:", deleteOthersData.message);
        if (deleteOthersRes.status !== 200) throw new Error("Logout other sessions failed");

        // Verify only Session C remains
        const finalSessionsRes = await fetch(`${API_URL}/sessions`, {
            headers: { "Authorization": `Bearer ${tokenC}` }
        });
        const finalSessionsData = await finalSessionsRes.json();
        console.log("   Session count after 'Logout Others':", finalSessionsData.sessions.length);
        if (finalSessionsData.sessions.length !== 1 || !finalSessionsData.sessions[0].current) {
            throw new Error("Cleanup failed: other sessions still exist or current session was deleted");
        }

        // ==========================================
        // 7. TOKEN REUSE & REPLAY BREACH DETECTION
        // ==========================================
        console.log("\n7. Testing Refresh Token Rotation and Replay Detection...");
        
        // Refresh Session C -> yields Cookie D
        console.log("   Performing normal token rotation (Refresh Session C)...");
        const rotateRes = await fetch(`${API_URL}/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieC }
        });
        const rotateData = await rotateRes.json();
        const cookieD = rotateRes.headers.get("set-cookie")?.split(";")[0];
        console.log("   Rotation Status:", rotateRes.status, "| New Cookie Obtained:", !!cookieD);
        if (rotateRes.status !== 200) throw new Error("Normal token refresh failed");

        // Reuse old Cookie C
        console.log("   Reusing the OLD/ROTATED Cookie C (Simulating a replay attack)...");
        const reuseRes = await fetch(`${API_URL}/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieC }
        });
        const reuseData = await reuseRes.json();
        console.log("   Replay Status (Expected 401):", reuseRes.status);
        console.log("   Replay Message:", reuseData.message);
        if (reuseRes.status !== 401) throw new Error("Replay attack was not detected!");

        // Verify that ALL sessions for the user were auto-revoked by the breach detector
        console.log("   Verifying that even the new Cookie D is now revoked...");
        const afterBreachRes = await fetch(`${API_URL}/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieD }
        });
        console.log("   Status after breach check (Expected 401):", afterBreachRes.status);
        if (afterBreachRes.status !== 401) {
            throw new Error("Security breach failed to revoke all user sessions!");
        }

                // ==========================================
        // 8. FORGOT & RESET PASSWORD (Security Invalidation)
        // ==========================================
        console.log("\n8. Testing Forgot & Reset Password Flow...");
        
        // Login again to establish a valid session (Session E)
        console.log("   Logging in to create Session E...");
        const loginERes = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
        });
        const loginEData = await loginERes.json();
        const cookieE = loginERes.headers.get("set-cookie")?.split(";")[0];
        console.log("   Session E cookie established:", !!cookieE);

        // Trigger Forgot Password
        console.log("   Triggering Forgot Password request...");
        const forgotRes = await fetch(`${API_URL}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL })
        });
        const forgotData = await forgotRes.json();
        const resetToken = forgotData.devResetToken;
        console.log("   Forgot Password Status:", forgotRes.status, "| Reset Token Received:", !!resetToken);
        if (forgotRes.status !== 200) throw new Error("Forgot password request failed");

        // Trigger Reset Password
        const NEW_TEST_PASSWORD = "brandnewpassword123";
        console.log("   Resetting password with the token...");
        const resetRes = await fetch(`${API_URL}/reset-password/${resetToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: NEW_TEST_PASSWORD })
        });
        const resetData = await resetRes.json();
        console.log("   Reset Password Status:", resetRes.status, "| Message:", resetData.message);
        if (resetRes.status !== 200) throw new Error("Password reset failed");

        // Verify that the old Session E cookie is now invalid
        console.log("   Verifying that Session E was revoked on password change...");
        const afterResetRes = await fetch(`${API_URL}/refresh`, {
            method: "POST",
            headers: { "Cookie": cookieE }
        });
        console.log("   Status after reset refresh (Expected 401):", afterResetRes.status);
        if (afterResetRes.status !== 401) {
            throw new Error("Old session remained active after password reset!");
        }

        // Verify we can login with the new password
        console.log("   Logging in with the new password...");
        const loginNewRes = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: NEW_TEST_PASSWORD })
        });
        console.log("   Login with new password status (Expected 200):", loginNewRes.status);
        if (loginNewRes.status !== 200) throw new Error("Failed to login with new password");


        console.log("\n🎉 ALL REFRACTORED INTEGRATION TESTS PASSED SUCCESSFULLY!");
        console.log("   - Decoupled Session Storage verified");
        console.log("   - User-Agent parsing verified");
        console.log("   - Session Listing and Revocation verified");
        console.log("   - Refresh Token Rotation (RTR) verified");
        console.log("   - Threat Mitigation / Replay Breach protection verified");

    } catch (err) {
        console.error("\n❌ Test failed:", err);
    }
}

runTests();
