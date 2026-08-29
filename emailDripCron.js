import crypto from "crypto";
import { Resend } from "resend";
import { DRIP_LESSONS } from "./emailDripTemplates.js";

const OWNER_EMAIL = "abhishekibef@gmail.com";
const FROM_EMAIL = "Moolzen <team@moolzen.com>";
const APPROVAL_SECRET = process.env.DRIP_SECRET || "moolzen_drip_secure_secret_2026";

// Store in-memory campaign state (backed by DB or token)
let currentPendingCampaign = {
  lessonId: 1,
  token: null,
  createdAt: null,
  status: "idle" // idle | pending_approval | approved | rejected
};

export function generateApprovalToken(lessonId) {
  const payload = `${lessonId}:${APPROVAL_SECRET}:${new Date().toDateString()}`;
  return crypto.createHash("sha256").update(payload).digest("hex").substring(0, 32);
}

export function verifyApprovalToken(lessonId, token) {
  const expected = generateApprovalToken(lessonId);
  return expected === token;
}

export function getCurrentCampaign() {
  return currentPendingCampaign;
}

export function setCampaignStatus(status, lessonId = null) {
  currentPendingCampaign.status = status;
  if (lessonId) currentPendingCampaign.lessonId = lessonId;
}

export async function sendPreviewToOwner(lessonId, prisma) {
  const lesson = DRIP_LESSONS.find(l => l.id === Number(lessonId)) || DRIP_LESSONS[0];
  const token = generateApprovalToken(lesson.id);

  currentPendingCampaign = {
    lessonId: lesson.id,
    token,
    createdAt: new Date(),
    status: "pending_approval"
  };

  const userCount = await prisma.user.count({ where: { email: { not: "" } } });
  const approveUrl = `https://api.moolzen.com/api/email-drip/approve?token=${token}&id=${lesson.id}`;
  const rejectUrl = `https://api.moolzen.com/api/email-drip/reject?token=${token}&id=${lesson.id}`;

  const previewWrapperHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Moolzen Broadcast Preview</title>
</head>
<body style="margin:0; padding:16px; background-color:#07090e; font-family:-apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width:640px; margin:0 auto 24px; background:#151922; border:2px solid #2563eb; border-radius:18px; padding:24px; color:#ffffff;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <span style="background:rgba(37,99,235,0.2); color:#60a5fa; font-weight:800; font-size:11px; padding:4px 10px; border-radius:999px; text-transform:uppercase;">
        📢 Moolzen Admin Approval Request
      </span>
      <span style="color:#94a3b8; font-size:12px; font-weight:600;">Audience: ${userCount} Users</span>
    </div>

    <h2 style="margin:0 0 6px; font-size:18px; color:#ffffff;">
      Scheduled: ${lesson.tag}
    </h2>
    <p style="margin:0 0 16px; font-size:13px; color:#94a3b8;">
      <b>Subject:</b> ${lesson.subject}
    </p>

    <div style="background:rgba(0,0,0,0.3); border-radius:12px; padding:16px; margin-bottom:20px; text-align:center;">
      <p style="margin:0 0 14px; font-size:14px; color:#e2e8f0; font-weight:600;">
        Review the email preview below. If everything looks good, tap Approve to broadcast:
      </p>
      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <a href="${approveUrl}" style="background:#22c55e; color:#0b0e14; font-weight:800; font-size:14px; padding:12px 24px; border-radius:10px; text-decoration:none; display:inline-block;">
          ✅ Approve & Broadcast to All ${userCount} Users
        </a>
        <a href="${rejectUrl}" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#f87171; font-weight:700; font-size:13px; padding:12px 18px; border-radius:10px; text-decoration:none; display:inline-block;">
          ❌ Skip / Cancel
        </a>
      </div>
    </div>

    <p style="margin:0; font-size:11px; color:#64748b; text-align:center;">
      Note: No emails will be sent to any user until you click the green Approve button above.
    </p>
  </div>

  <!-- ACTUAL EMAIL BODY PREVIEW -->
  <div style="max-width:640px; margin:0 auto;">
    <p style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 8px 12px;">Email Content Preview:</p>
    ${lesson.htmlContent}
  </div>
</body>
</html>
  `;

  // Send preview to owner
  const resend = new Resend(process.env.RESEND_API_KEY || "re_fallback");
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: OWNER_EMAIL,
      subject: `[APPROVAL REQUIRED] ${lesson.tag}: ${lesson.subject}`,
      html: previewWrapperHtml
    });
    console.log(`✅ Sent Drip Preview for Lesson ${lesson.id} to owner ${OWNER_EMAIL}`);
    return { success: true, result, lesson };
  } catch (err) {
    console.error(`❌ Failed to send drip preview:`, err);
    return { success: false, error: err.message, lesson };
  }
}

export async function executeDripBroadcast(lessonId, prisma) {
  const lesson = DRIP_LESSONS.find(l => l.id === Number(lessonId)) || DRIP_LESSONS[0];
  const resend = new Resend(process.env.RESEND_API_KEY || "re_fallback");

  const users = await prisma.user.findMany({
    where: { email: { not: "" } },
    select: { email: true, name: true }
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: lesson.subject,
        html: lesson.htmlContent
      });
      sent++;
    } catch (err) {
      failed++;
    }
  }

  // Advance to next lesson for next time
  const nextLessonId = (lesson.id % DRIP_LESSONS.length) + 1;
  setCampaignStatus("approved", nextLessonId);

  return { success: true, sent, failed, total: users.length, lesson };
}
