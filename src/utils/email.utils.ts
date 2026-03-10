import sendMailTransporter from "../config/email";
import crypto from "crypto";

/**
 * Generate a temporary password
 * This is also exported from password.utils.ts for consistency
 */
export const generateTemporaryPassword = (): string => {
  // Generate a strong random password
  const length = 12;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";

  // Use crypto for better randomness
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
};

/**
 * Send welcome email with temporary password to newly created user
 */
export const sendUserCreatedEmail = async (
  email: string,
  name: string,
  temporaryPassword: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    console.warn("Email notifications not configured - EMAIL_FROM not set");
    return;
  }

  const appName = process.env.APP_NAME || "Project Management System";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    await sendMailTransporter(() => {
      const subject = `Welcome to ${appName} - Your Account Details`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background-color: #800000;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
              }
              .content {
                background-color: #f9fafb;
                padding: 30px;
                border: 1px solid #e5e7eb;
                border-top: none;
                border-radius: 0 0 8px 8px;
              }
              .credentials-box {
                background-color: white;
                border: 2px solid #800000;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
              }
              .credential-item {
                margin: 10px 0;
                padding: 10px;
                background-color: #f3f4f6;
                border-radius: 4px;
              }
              .credential-label {
                font-weight: bold;
                color: #800000;
                display: block;
                margin-bottom: 5px;
              }
              .credential-value {
                font-size: 16px;
                color: #1f2937;
                font-family: 'Courier New', monospace;
              }
              .warning {
                background-color: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .button {
                display: inline-block;
                background-color: #800000;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 6px;
                margin: 20px 0;
                font-weight: bold;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
              }
              .instructions {
                background-color: #dbeafe;
                border-left: 4px solid #800000;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .instructions ol {
                margin: 10px 0;
                padding-left: 20px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Welcome to ${appName}!</h1>
            </div>
            
            <div class="content">
              <p>Hello ${name},</p>
              
              <p>Your account has been created successfully by the system administrator. You can now access the ${appName} platform.</p>
              
              <div class="credentials-box">
                <h3 style="margin-top: 0; color: #4F46E5;">Your Login Credentials</h3>
                
                <div class="credential-item">
                  <span class="credential-label">Email:</span>
                  <span class="credential-value">${email}</span>
                </div>
                
                <div class="credential-item">
                  <span class="credential-label">Temporary Password:</span>
                  <span class="credential-value">${temporaryPassword}</span>
                </div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important Security Notice:</strong>
                <p style="margin: 10px 0 0 0;">This is a temporary password. For security reasons, you will be required to change it upon your first login.</p>
              </div>
              
              <div class="instructions">
                <strong>Getting Started:</strong>
                <ol>
                  <li>Click the button below to access the login page</li>
                  <li>Enter your email and temporary password</li>
                  <li>You'll be prompted to create a new, secure password</li>
                  <li>Start using the platform!</li>
                </ol>
              </div>
              
              <div style="text-align: center;">
                <a href="${appUrl}/login" class="button">Go to Login Page</a>
              </div>
              
              <p style="margin-top: 30px;">If you have any questions or need assistance, please contact your system administrator or our support team.</p>
              
              <p>Best regards,<br>The ${appName} Team</p>
            </div>
            
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>If you did not expect to receive this email, please contact your administrator immediately.</p>
            </div>
          </body>
        </html>
      `;

      const textContent = `
        Welcome to ${appName}!

        Hello ${name},

        Your account has been created successfully by the system administrator. You can now access the ${appName} platform.

        Your Login Credentials:
        -----------------------
        Email: ${email}
        Temporary Password: ${temporaryPassword}

        ⚠️ IMPORTANT SECURITY NOTICE:
        This is a temporary password. For security reasons, you will be required to change it upon your first login.

        Getting Started:
        1. Visit: ${appUrl}/login
        2. Enter your email and temporary password
        3. You'll be prompted to create a new, secure password
        4. Start using the platform!

        If you have any questions or need assistance, please contact your system administrator or our support team.

        Best regards,
        The ${appName} Team

        ---
        This is an automated message. Please do not reply to this email.
        If you did not expect to receive this email, please contact your administrator immediately.
      `;
      return {
        to: email,
        subject,
        html: htmlContent,
        text: textContent
      }
    });

    console.log(`Welcome email sent successfully to ${email}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error);
    throw new Error("Failed to send welcome email");
  }
};

/**
 * Send password change notification
 */
export const sendPasswordChangedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    return;
  }

  const appName = process.env.APP_NAME || "Project Management System";

  try {
    await sendMailTransporter(() => {
      const subject = `${appName} - Password Changed Successfully`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9fafb; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Password Changed Successfully</h2>
              </div>
              <div class="content">
                <p>Hello ${name},</p>
                <p>Your password has been changed successfully.</p>
                <p>If you did not make this change, please contact your administrator immediately.</p>
                <p>Best regards,<br>The ${appName} Team</p>
              </div>
              <div class="footer">
                <p>This is an automated notification.</p>
              </div>
            </div>
          </body>
        </html>
      `;
      return {
        to: email,
        subject,
        html: htmlContent,
      }
    });
  } catch (error) {
    console.error("Failed to send password change notification:", error);
  }
};

/**
 * Send account deactivation notification
 */
export const sendAccountDeactivatedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    return;
  }

  const appName = process.env.APP_NAME || "Project Management System";

  try {
    await sendMailTransporter(() => {
      const subject = `${appName} - Account Deactivated`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9fafb; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Account Deactivated</h2>
              </div>
              <div class="content">
                <p>Hello ${name},</p>
                <p>Your account has been deactivated by the system administrator.</p>
                <p>You will no longer have access to the ${appName} platform.</p>
                <p>If you believe this is an error, please contact your administrator.</p>
                <p>Best regards,<br>The ${appName} Team</p>
              </div>
              <div class="footer">
                <p>This is an automated notification.</p>
              </div>
            </div>
          </body>
        </html>
      `;
      return {
        to: email,
        subject,
        html: htmlContent,
      }
    });
  } catch (error) {
    console.error("Failed to send account deactivation notification:", error);
  }
};

/**
 * Send account reactivation notification
 */
export const sendAccountReactivatedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    return;
  }

  const appName = process.env.APP_NAME || "Project Management System";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    await sendMailTransporter(() => {
      const subject = `${appName} - Account Reactivated`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9fafb; }
              .button { display: inline-block; background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Account Reactivated</h2>
              </div>
              <div class="content">
                <p>Hello ${name},</p>
                <p>Good news! Your account has been reactivated by the system administrator.</p>
                <p>You now have access to the ${appName} platform again.</p>
                <div style="text-align: center;">
                  <a href="${appUrl}/login" class="button">Login to Your Account</a>
                </div>
                <p>Best regards,<br>The ${appName} Team</p>
              </div>
              <div class="footer">
                <p>This is an automated notification.</p>
              </div>
            </div>
          </body>
        </html>
      `;
      return {
        to: email,
        subject,
        html: htmlContent,
      }
    });
  } catch (error) {
    console.error("Failed to send account reactivation notification:", error);
  }
};

/**
 * Send password reset request email with token link
 */
export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetToken: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) {
    console.warn("Email notifications not configured - EMAIL_FROM not set");
    return;
  }

  const appName = process.env.APP_NAME || "Project Management System";
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  try {
    await sendMailTransporter(() => {
      const subject = `${appName} - Password Reset Request`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #800000; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background-color: #800000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
              .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .token-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin: 20px 0; word-break: break-all; font-family: 'Courier New', monospace; font-size: 13px; color: #4b5563; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>We received a request to reset your password for your ${appName} account. Click the button below to set a new password.</p>

              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset My Password</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <div class="token-box">${resetUrl}</div>

              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                  <li>This link expires in <strong>30 minutes</strong>.</li>
                  <li>It can only be used once.</li>
                  <li>If you did not request this reset, you can safely ignore this email — your password will not change.</li>
                </ul>
              </div>

              <p>Best regards,<br>The ${appName} Team</p>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </body>
        </html>
      `;

      const textContent = `
        Password Reset Request - ${appName}

        Hello ${name},

        We received a request to reset your password. Use the link below:

        ${resetUrl}

        This link expires in 30 minutes and can only be used once.

        If you did not request this, ignore this email — your password won't change.

        Best regards,
        The ${appName} Team
      `;

      return { to: email, subject, html: htmlContent, text: textContent };
    });

    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error(`Failed to send password reset email to ${email}:`, error);
    throw new Error("Failed to send password reset email");
  }
};

/**
 * Send confirmation email after a successful password reset
 */
export const sendPasswordResetSuccessEmail = async (
  email: string,
  name: string
): Promise<void> => {
  if (!process.env.EMAIL_FROM) return;

  const appName = process.env.APP_NAME || "Project Management System";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    await sendMailTransporter(() => {
      const subject = `${appName} - Password Reset Successful`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { padding: 30px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background-color: #800000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
              .alert { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>✅ Password Reset Successful</h2>
              </div>
              <div class="content">
                <p>Hello ${name},</p>
                <p>Your password has been successfully reset. You can now log in with your new password.</p>

                <div style="text-align: center;">
                  <a href="${appUrl}/login" class="button">Go to Login</a>
                </div>

                <div class="alert">
                  <strong>Wasn't you?</strong> If you did not reset your password, contact your administrator immediately — your account may be compromised.
                </div>

                <p>Best regards,<br>The ${appName} Team</p>
              </div>
              <div class="footer">
                <p>This is an automated notification.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      return { to: email, subject, html: htmlContent };
    });
  } catch (error) {
    console.error("Failed to send password reset success email:", error);
  }
};
