import { prisma } from "#src/config/prisma.js";
import { ApiError } from "#src/utils/ApiError.js";
import { signAccessToken, signRefreshToken, hashToken, verifyRefreshToken } from "#src/utils/tokens.js";
import { generateOtp, hashOtp, generateResetToken } from "#src/utils/otp.js";
import { hashPassword, comparePassword, safeUser } from "#src/utils/password.js";
import { sendMail } from "#src/mail/mailer.js";
import { mailTemplates } from "#src/mail/templates.js";
import { sendSms } from "#src/utils/sms.js";
import { verifyGoogleIdToken, googleConfigured } from "#src/config/google.js";
import { env } from "#src/config/env.js";
import logger from "#src/utils/logger.js";

// ── internal helpers ─────────────────────────────────

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });
  return { accessToken, refreshToken, user: updated };
}

async function createOtp(email, purpose, meta = {}) {
  await prisma.otp.deleteMany({ where: { email, purpose } }); // one active code per purpose
  const { code, codeHash } = generateOtp();
  await prisma.otp.create({
    data: {
      email,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + env.otpExpireMinutes * 60 * 1000),
      meta,
    },
  });
  return code;
}

async function consumeOtp(email, purpose, code) {
  const record = await prisma.otp.findFirst({ where: { email, purpose } });
  if (!record) throw ApiError.badRequest("No active code found — request a new one");

  if (record.attempts >= env.otpMaxAttempts) {
    await prisma.otp.delete({ where: { id: record.id } });
    throw ApiError.tooMany("Too many wrong attempts — request a new code");
  }
  if (record.expiresAt < new Date()) {
    await prisma.otp.delete({ where: { id: record.id } });
    throw ApiError.badRequest("Code expired — request a new one");
  }
  if (record.codeHash !== hashOtp(code)) {
    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts: record.attempts + 1 },
    });
    throw ApiError.badRequest("Invalid code");
  }
  const meta = record.meta ?? {};
  await prisma.otp.deleteMany({ where: { email, purpose } });
  return meta;
}

// ── public API ───────────────────────────────────────

export async function signup({ name, email, phone, password }) {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw ApiError.conflict("An account with this email already exists");

  const user = await prisma.user.create({
    data: { name, email, phone, password: await hashPassword(password), providers: ["local"] },
  });

  const code = await createOtp(email, "email_verification");
  await sendMail({
    to: email,
    subject: `Verify your email — ${env.appName}`,
    html: mailTemplates.verifyEmail(code, env.otpExpireMinutes),
  });

  logger.info(`Signup: ${email} — verification OTP sent`);
  return { email: user.email, message: "Account created — check your email for the verification code" };
}

export async function verifyEmail({ email, otp }) {
  await consumeOtp(email, "email_verification", otp);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.notFound("Account not found");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { accountVerified: true },
  });
  const tokens = await issueTokens(updated);

  await sendMail({
    to: email,
    subject: `Welcome to ${env.appName} 🎉`,
    html: mailTemplates.welcome(updated.name),
  });

  return { user: safeUser(tokens.user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function signin({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) throw ApiError.unauthorized("Invalid email or password");
  if (!user.isActive) throw ApiError.forbidden("Account is deactivated");
  if (!user.accountVerified) {
    const err = ApiError.forbidden("Please verify your email first");
    err.code = "EMAIL_NOT_VERIFIED";
    throw err;
  }
  const ok = await comparePassword(password, user.password);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  const tokens = await issueTokens(user);
  return { user: safeUser(tokens.user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function googleSignin({ idToken }) {
  if (!googleConfigured()) {
    throw ApiError.badRequest("Google login is not configured (GOOGLE_CLIENT_ID missing)");
  }
  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch {
    throw ApiError.unauthorized("Invalid Google token");
  }
  if (!profile.emailVerified) throw ApiError.badRequest("Google email is not verified");

  let user =
    (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
    (await prisma.user.findUnique({ where: { email: profile.email } }));

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: profile.name ?? profile.email.split("@")[0],
        email: profile.email,
        googleId: profile.googleId,
        avatarUrl: profile.picture ?? null,
        providers: ["google"],
        accountVerified: true,
      },
    });
    logger.info(`Google signup: ${profile.email}`);
  } else {
    if (!user.isActive) throw ApiError.forbidden("Account is deactivated");
    const providers = user.providers.includes("google") ? user.providers : [...user.providers, "google"];
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: user.googleId ?? profile.googleId,
        providers,
        accountVerified: true,
      },
    });
  }

  const tokens = await issueTokens(user);
  return { user: safeUser(tokens.user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function refresh(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized("Refresh token required");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.isActive) throw ApiError.unauthorized("Invalid refresh token");

  // Reuse detection — a stolen/old token kills the whole session.
  if (!user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
    await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
    throw ApiError.unauthorized("Session revoked — please sign in again");
  }

  const tokens = await issueTokens(user); // rotation: old token dies here
  return { user: safeUser(tokens.user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function logout(userId) {
  await prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
}

export async function forgotPassword({ email }) {
  // Always respond success — never reveal whether the email exists.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const { token, tokenHash } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const resetUrl = `${env.frontendUrls[0] ?? env.appUrl}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: `Reset your password — ${env.appName}`,
      html: mailTemplates.resetPassword(resetUrl),
    });
  }
  return { message: "If an account exists for this email, a reset link was sent" };
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { passwordResetTokenHash: tokenHash, passwordResetExpires: { gt: new Date() } },
  });

  if (!user) throw ApiError.badRequest("Reset link is invalid or expired");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await hashPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      refreshTokenHash: null, // every other session is signed out
    },
  });

  await sendMail({
    to: user.email,
    subject: `Password changed — ${env.appName}`,
    html: mailTemplates.passwordChanged(),
  });

  return { message: "Password changed — please sign in again" };
}

export async function forgotEmailRequest({ phone }) {
  const user = await prisma.user.findUnique({ where: { phone } });
  // Don't reveal whether the phone exists either.
  if (user?.isActive) {
    const code = await createOtp(user.email, "email_recovery");
    await sendSms({ to: phone, body: `${env.appName}: your code is ${code}. Valid ${env.otpExpireMinutes} min.` });
  }
  return { message: "If an account exists for this phone, a code was sent" };
}

export async function recoverEmail({ phone, otp }) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw ApiError.badRequest("Invalid code");
  await consumeOtp(user.email, "email_recovery", otp);
  return { email: user.email };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.password) throw ApiError.badRequest("This account has no password (signed up with Google)");

  const ok = await comparePassword(currentPassword, user.password);
  if (!ok) throw ApiError.unauthorized("Current password is incorrect");

  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(newPassword), refreshTokenHash: null }, // sign out everywhere else
  });

  await sendMail({
    to: user.email,
    subject: `Password changed — ${env.appName}`,
    html: mailTemplates.passwordChanged(),
  });

  return { message: "Password changed" };
}

export async function requestEmailChange(userId, { newEmail }) {
  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken) throw ApiError.conflict("This email is already in use");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const code = await createOtp(user.email, "email_change", { newEmail });
  await sendMail({
    to: newEmail,
    subject: `Verify your new email — ${env.appName}`,
    html: mailTemplates.verifyEmail(code, env.otpExpireMinutes),
  });
  return { message: "Verification code sent to your new email" };
}

export async function confirmEmailChange(userId, { otp }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const { newEmail } = await consumeOtp(user.email, "email_change", otp);
  if (!newEmail) throw ApiError.badRequest("Invalid code");

  const oldEmail = user.email;
  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, refreshTokenHash: null }, // all sessions revoked
  });

  await sendMail({
    to: oldEmail,
    subject: `Email changed — ${env.appName}`,
    html: mailTemplates.emailChanged(newEmail),
  });

  return { message: "Email changed — please sign in again" };
}
