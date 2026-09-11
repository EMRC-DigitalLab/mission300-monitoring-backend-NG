export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Email-safe mirror of the design tokens in m300-frontend/src/styles/theme.css.
 * Email clients can't read CSS custom properties (Outlook strips <style>
 * blocks entirely), so these are the same values, copied and frozen rather
 * than shared at build time. If the dashboard's default brand/status colors
 * change, update both files.
 */
const token = {
  brand600: "#004972", // CDMU navy — header bar, buttons, links on dark
  gold: "#ffca05", // secondary accent — thin strip under the header, echoes the navy+gold identity
  surface: "#ffffff",
  surfacePage: "#f2f3f5",
  surfaceSunken: "#f5f6f8",
  borderDefault: "#eaecf0",
  textDefault: "#101828",
  textMuted: "#667085",
  link: "#0b5cad",
  radiusCard: "12px",
  radiusControl: "8px",
  statusPositiveFg: "#00764a",
  statusPositiveBg: "#e6f4ed",
  statusWarningFg: "#8f5605",
  statusWarningBg: "#fbf0d5",
  statusNegativeFg: "#a8201a",
  statusNegativeBg: "#fbe9e6",
  statusNeutralFg: "#4a5462",
  statusNeutralBg: "#eef0f3",
} as const;

// Google Sans itself is self-hosted by the dashboard (not on a public font
// CDN), so it can't be reliably loaded in an email client. Falling through to
// each platform's own system UI font keeps the same geometric-grotesk
// character instead of dropping to a generic serif/Times fallback.
const fontFamily =
  "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The Federal Republic of Nigeria coat of arms, shown top-left of every
// email in the same logo-rule-wordmark lockup used on the login page
// (auth-layout.tsx) and the public masthead (public-header.tsx, sidebar.tsx)
// - all three default to this same file. (The filename is misleading; it's
// the coat of arms, not a gEApp mark - see institutions.tsx's alt text on
// the same asset.) Email clients fetch images over plain HTTP from the
// sender's own server rather than bundling them, so this has to be an
// absolute URL; FRONTEND_URL is already used the same way for reset/invite
// links (see auth.service.ts).
const logoUrl = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/Logos/geapp.png`;

/** Escapes user-controlled strings before they're interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The one place that controls what every email looks like. Matches the
 * dashboard's default theme (navy + gold, card surfaces, the same type and
 * radius scale) so a notification and the product it's from read as the same
 * thing. Upgrading the visual design later is a change to this file only,
 * not a hunt through every template.
 *
 * `preheader` is the short preview text inbox lists show next to the
 * subject - keep it under ~90 characters.
 */
export function renderLayout(title: string, bodyHtml: string, preheader?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${token.surfacePage};">
    ${
      preheader
        ? `<span style="display: none; font-size: 1px; color: ${token.surfacePage}; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${escapeHtml(preheader)}</span>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${token.surfacePage};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 560px; background-color: ${token.surface}; border: 1px solid ${token.borderDefault}; border-radius: ${token.radiusCard}; overflow: hidden;">
            <tr>
              <td style="background-color: ${token.brand600}; padding: 20px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color: #ffffff; border-radius: 6px; padding: 4px; vertical-align: middle;">
                      <img src="${logoUrl}" width="40" height="40" alt="Federal Republic of Nigeria coat of arms" style="display: block; width: 40px; height: 40px; border: 0;" />
                    </td>
                    <td style="width: 1px; background-color: rgba(255, 255, 255, 0.25); font-size: 0; line-height: 0;">&nbsp;</td>
                    <td style="vertical-align: middle; padding-left: 14px;">
                      <div style="font-family: ${fontFamily}; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.011em;">M300</div>
                      <div style="font-family: ${fontFamily}; color: rgba(255, 255, 255, 0.68); font-size: 12px; margin-top: 2px;">Nigeria Energy Compact Dashboard</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${token.gold}; height: 4px; line-height: 4px; font-size: 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 32px; font-family: ${fontFamily}; color: ${token.textDefault}; font-size: 15px; line-height: 1.6;">
                <h1 style="margin: 0 0 16px; font-family: ${fontFamily}; font-size: 20px; line-height: 1.3; font-weight: 700; color: ${token.textDefault}; letter-spacing: -0.011em;">${escapeHtml(title)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color: ${token.surfaceSunken}; border-top: 1px solid ${token.borderDefault}; padding: 20px 32px;">
                <p style="margin: 0 0 6px; font-family: ${fontFamily}; font-size: 12px; line-height: 1.5; color: ${token.textMuted};">
                  M300 Nigeria Energy Compact Dashboard — automated notification, please do not reply.
                </p>
                <p style="margin: 0; font-family: ${fontFamily}; font-size: 11px; line-height: 1.5; color: ${token.textMuted};">
                  Delivery partners: SEforALL, GEAPP · Platform built by EMRC
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Shared CTA button - every "click here to do X" email uses this. */
export function renderButton(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 24px;">
      <tr>
        <td style="border-radius: ${token.radiusControl}; background-color: ${token.brand600};">
          <a href="${safeUrl}"
             style="display: inline-block; padding: 12px 24px; font-family: ${fontFamily}; font-size: 14px;
                    font-weight: 600; color: #ffffff; text-decoration: none; border-radius: ${token.radiusControl};">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; font-family: ${fontFamily}; font-size: 12px; color: ${token.textMuted};">
      Or copy this link:<br />
      <a href="${safeUrl}" style="color: ${token.link}; word-break: break-all;">${safeUrl}</a>
    </p>`;
}

export type BadgeTone = "positive" | "warning" | "negative" | "neutral";

const badgeTones: Record<BadgeTone, { fg: string; bg: string }> = {
  positive: { fg: token.statusPositiveFg, bg: token.statusPositiveBg },
  warning: { fg: token.statusWarningFg, bg: token.statusWarningBg },
  negative: { fg: token.statusNegativeFg, bg: token.statusNegativeBg },
  neutral: { fg: token.statusNeutralFg, bg: token.statusNeutralBg },
};

/**
 * Pill badge using the same status vocabulary as the dashboard's delivery-
 * status and confidence indicators (theme.css --color-status-*), so a
 * decision reads with the same visual weight in an email as it does on the
 * submissions table.
 */
export function renderStatusBadge(label: string, tone: BadgeTone): string {
  const { fg, bg } = badgeTones[tone];
  return `<span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: ${bg}; color: ${fg}; font-family: ${fontFamily}; font-size: 12px; font-weight: 600;">${escapeHtml(label)}</span>`;
}
