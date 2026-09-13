import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return redirect("/seller/settings");
}

export default function SellerStoreRedirect() {
  return null;
}
