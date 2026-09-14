import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM_EMAIL =
  process.env.HAIRGRAB_FROM_EMAIL ||
  "HairGrab <onboarding@resend.dev>";

type SendSellerApprovalEmailArgs = {
  to: string;
  firstName: string;
  businessName: string;
  sellerCode: string;
  onboardingUrl: string;
};

export async function sendSellerApprovalEmail({
  to,
  firstName,
  businessName,
  sellerCode,
  onboardingUrl,
}: SendSellerApprovalEmailArgs) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const safeFirstName = firstName?.trim() || "Seller";
  const safeBusinessName = businessName?.trim() || "your business";

  const { data, error } = await resend.emails.send({
    from: DEFAULT_FROM_EMAIL,
    to,
    subject: "You’re approved to sell on HairGrab",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #21152a; line-height: 1.6;">
        <div style="padding: 28px 0 18px;">
          <div style="font-size: 13px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #7b3fa0;">
            HairGrab Marketplace
          </div>

          <h1 style="font-size: 28px; margin: 8px 0 14px; color: #4B1678;">
            You’re approved!
          </h1>

          <p>Hi ${safeFirstName},</p>

          <p>
            Great news — <strong>${safeBusinessName}</strong> has been approved to sell on HairGrab.
          </p>

          <p>
            Your HairGrab Seller ID is:
            <strong style="color: #4B1678;">${sellerCode}</strong>
          </p>

          <p>
            Your seller account has been created. Your next step is to finish setting up your seller account and complete onboarding.
          </p>

          <div style="margin: 28px 0;">
            <a
              href="${onboardingUrl}"
              style="
                display: inline-block;
                background: #4B1678;
                color: #ffffff;
                text-decoration: none;
                padding: 13px 22px;
                border-radius: 8px;
                font-weight: 700;
              "
            >
              Finish Your Seller Setup
            </a>
          </div>

          <p style="font-size: 14px; color: #6f6675;">
            If the button above does not work, copy and paste this link into your browser:
          </p>

          <p style="font-size: 13px; word-break: break-all; color: #4B1678;">
            ${onboardingUrl}
          </p>

          <hr style="border: 0; border-top: 1px solid #eee6f2; margin: 30px 0;" />

          <p style="font-size: 13px; color: #756b7b;">
            Welcome to HairGrab — Find It. Love It. Grab It.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(
      `Unable to send seller approval email: ${error.message}`,
    );
  }

  return data;
}

type SendSellerLoginEmailArgs = {
  to: string;
  firstName?: string | null;
  loginUrl: string;
};

export async function sendSellerLoginEmail({
  to,
  firstName,
  loginUrl,
}: SendSellerLoginEmailArgs) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const safeFirstName = (firstName?.trim() || "Seller").replace(
    /[&<>"']/g,
    (character) => htmlEntities[character] || character,
  );

  const { data, error } = await resend.emails.send({
    from: DEFAULT_FROM_EMAIL,
    to,
    subject: "Your HairGrab Seller Sign-In Link",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #21152a; line-height: 1.6;">
        <div style="padding: 28px 0 18px;">
          <div style="font-size: 13px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #7b3fa0;">
            HairGrab Seller Portal
          </div>

          <h1 style="font-size: 28px; margin: 8px 0 14px; color: #4B1678;">
            Sign in to HairGrab
          </h1>

          <p>Hi ${safeFirstName},</p>

          <p>Use the secure link below to sign in to your HairGrab Seller Portal.</p>

          <div style="margin: 28px 0;">
            <a
              href="${loginUrl}"
              style="display: inline-block; background: #4B1678; color: #ffffff; text-decoration: none; padding: 13px 22px; border-radius: 8px; font-weight: 700;"
            >
              Sign In to HairGrab
            </a>
          </div>

          <p style="font-size: 14px; color: #6f6675;">
            This link expires in 15 minutes and can only be used once. If you did not request this sign-in link, you can ignore this email.
          </p>

          <p style="font-size: 13px; color: #756b7b;">
            HairGrab<br />Find It. Love It. Grab It.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(
      `Unable to send seller sign-in email: ${error.message}`,
    );
  }

  return data;
}
