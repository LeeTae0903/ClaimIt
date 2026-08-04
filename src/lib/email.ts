import { Resend } from "resend";

// Resend's constructor throws on a falsy key, which would crash the app at
// import time before RESEND_API_KEY is configured. Fall back to a placeholder
// so that failure happens at send-time (a real API error) instead.
const resend = new Resend(process.env.RESEND_API_KEY || "re_not_configured");

const FROM = process.env.EMAIL_FROM ?? "claimIT <onboarding@resend.dev>";

type OtpType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

const SUBJECTS: Record<OtpType, string> = {
  "sign-in": "Your claimIT sign-in code",
  "email-verification": "Verify your claimIT email",
  "forget-password": "Reset your claimIT password",
  "change-email": "Confirm your new claimIT email",
};

// The caller must not block its response on this (response time would reveal
// whether an account exists), but must not drop the promise either — see the
// backgroundTasks handler in auth.ts, which routes it through Next's
// `after()` so it survives past the response on serverless.
export async function sendOtpEmail({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: OtpType;
}) {
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: SUBJECTS[type],
    html: `<p>Your code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
  });

  // Resend reports API failures in the response rather than throwing, so an
  // unset/invalid key, an unverified sender or a rate limit all look like
  // success unless checked. The caller deliberately can't surface this to the
  // user (that would leak whether the account exists), so logging loudly here
  // is the only signal there is — without it the send fails completely
  // silently and there's nothing to debug from.
  if (error) {
    console.error(`[email] OTP send failed (${type}):`, error.name, error.message);
    throw new Error(`Resend rejected the OTP email: ${error.name}`);
  }
}
