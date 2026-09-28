import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUrl,
  Matches,
} from "class-validator";
import { WEBHOOK_PATTERNS } from "@/notifications/webhooks/webhook-policy";

export class CreateWebhookSubscriptionDto {
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost works in local/staging testing
  url!: string;

  // Each entry is either an exact event name ("submission.decision_recorded")
  // or a prefix wildcard ("submission.*") - see WebhooksService.dispatch().
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEBHOOK_PATTERNS.length)
  @ArrayUnique()
  @IsIn(WEBHOOK_PATTERNS, { each: true })
  @IsString({ each: true })
  @Matches(/^[a-z_]+(\.[a-z_]+|\.\*)$/, {
    each: true,
    message: 'each event must look like "resource.event" or "resource.*"',
  })
  events!: string[];
}
