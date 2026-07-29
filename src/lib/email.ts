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

// Intentionally not awaited by callers — Better Auth recommends this so
// response time doesn't reveal whether an account exists.
export function sendOtpEmail({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: OtpType;
}) {
  return resend.emails.send({
    from: FROM,
    to: email,
    subject: SUBJECTS[type],
    html: `<p>Your code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
  });
}
