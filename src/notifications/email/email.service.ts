import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Thin Resend wrapper. RESEND_API_KEY is optional at boot (see
 * env.validation.ts) so local dev doesn't need a real key - without one,
 * this logs what would have been sent instead of throwing, so the rest of
 * the notification pipeline (webhooks, event wiring) can still be exercised.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>("EMAIL_FROM", "notifications@raven-emrc.com");

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set - emails will be logged, not sent");
    }
  }

  async send({ to, subject, html }: SendEmailInput): Promise<void> {
    if (!this.resend) {
      // Pull out any link(s) so a set-password/reset-password email is
      // actually usable in local dev without a real Resend key - without
      // this, there'd be no way to get the token out of the system at all.
      // Matches only <a href="..."> (the actual CTA links renderButton()
      // emits), not the <head>'s Google Fonts <link href="...">, which
      // otherwise always wins as the first href in the document.
      const links = [...html.matchAll(/<a\s+href="([^"]+)"/gi)].map((match) => match[1]);
      this.logger.log(
        `[email skipped, no RESEND_API_KEY] to=${to} subject="${subject}"` +
          (links.length ? ` link=${links[0]}` : ""),
      );
      return;
    }

    const { error } = await this.resend.emails.send({ from: this.from, to, subject, html });
    if (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }
}
