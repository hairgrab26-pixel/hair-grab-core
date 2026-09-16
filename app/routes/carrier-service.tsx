import type { ActionFunctionArgs } from "react-router";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { createCarrierRateHandler } from "../same-day-carrier.server.ts";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response("", { status: 405 });
  try {
    const raw = await request.text();
    const body = JSON.parse(raw);
    const result = await createCarrierRateHandler()(body);
    return Response.json(result);
  } catch { return Response.json({ rates: [] }); }
};
