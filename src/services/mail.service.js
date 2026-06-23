export const sendVerificationEmail = async (email, name, verificationUrl) => {
    console.log("\n✉️ [Mail Service] Verification Email");
    console.log(`to: ${name} (${email})`);
    console.log(`Link: ${verificationUrl}\n`);
};

export const sendResetPasswordEmail = async (email, resetUrl) => {
    console.log("\n✉️ [Mail Service] Password Reset Email");
    console.log(`to: ${email}`);
    console.log(`Link: ${resetUrl}\n`);
};

export const sendWelcomeEmail = async (email, name) => {
    console.log(`\n✉️  [Mail Service] Welcome Email`);
    console.log(`To: ${name} (${email}) - "Welcome to the App!"\n`);
}