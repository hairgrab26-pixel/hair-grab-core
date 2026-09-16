import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { SCOPES_QUERY, schedulerForShop, summarizeSameDayFlags, summarizeSameDayReadiness } from "../same-day-shopify.server";

// Read-only diagnostics. No action export: this route can never accept a POST/mutation.
// Makes exactly one Shopify GraphQL read (SCOPES_QUERY) and zero database calls.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const scheduler = schedulerForShop(session.shop);
  const data = await scheduler.request(admin, SCOPES_QUERY);
  return Response.json({
    ...summarizeSameDayReadiness(data),
    flags: summarizeSameDayFlags(process.env),
  });
};
