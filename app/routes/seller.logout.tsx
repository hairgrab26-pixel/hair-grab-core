import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import { redirect } from "react-router";

import { clearSellerSessionCookie } from "../seller-session.server";

function logout() {
  return redirect("/seller/login", {
    headers: {
      "Set-Cookie": clearSellerSessionCookie(),
    },
  });
}

export function loader({}: LoaderFunctionArgs) {
  return logout();
}

export function action({}: ActionFunctionArgs) {
  return logout();
}

export default function SellerLogoutRoute() {
  return null;
}
