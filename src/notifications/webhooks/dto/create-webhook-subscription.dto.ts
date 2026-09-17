import { ArrayMinSize, IsArray, IsString, IsUrl, Matches } from "class-validator";

export class CreateWebhookSubscriptionDto {
  @IsUrl({ require_tld: false }) // require_tld: false so http://localhost works in local/staging testing
  url!: string;

  // Each entry is either an exact event name ("submission.decision_recorded")
  // or a prefix wildcard ("submission.*") - see WebhooksService.dispatch().
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[a-z_]+(\.[a-z_]+|\.\*)$/, {
    each: true,
    message: 'each event must look like "resource.event" or "resource.*"',
  })
  events!: string[];
}
