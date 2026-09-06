import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  return {
    seller: {
      businessName:
        seller.businessName,
      sellerCode:
        seller.sellerCode,
      storeDescription:
        seller.storeDescription ||
        "",
      logoUrl:
        seller.logoUrl ||
        "",
      website:
        seller.website ||
        "",
      instagram:
        seller.instagram ||
        "",
      tiktok:
        seller.tiktok ||
        "",
    },
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const formData =
    await request.formData();

  await db.seller.update({
    where: {
      id:
        seller.id,
    },
    data: {
      storeDescription:
        String(
          formData.get(
            "storeDescription",
          ) ||
          "",
        ).trim() ||
        null,

      logoUrl:
        String(
          formData.get(
            "logoUrl",
          ) ||
          "",
        ).trim() ||
        null,

      website:
        String(
          formData.get(
            "website",
          ) ||
          "",
        ).trim() ||
        null,

      instagram:
        String(
          formData.get(
            "instagram",
          ) ||
          "",
        ).trim() ||
        null,

      tiktok:
        String(
          formData.get(
            "tiktok",
          ) ||
          "",
        ).trim() ||
        null,
    },
  });

  return {
    success:
      true,
    message:
      "Storefront information saved.",
  };
};


export default function SellerStorePage() {
  const {
    seller,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  return (
    <Shell
      back="/seller"
      backLabel="Dashboard"
      title="Storefront"
      subtitle="Manage the information shoppers see about your HairGrab store."
    >
      {actionData && (
        <Notice
          text={
            actionData.message
          }
        />
      )}

      <Form
        method="post"
      >
        <Field
          label="Store Description"
          name="storeDescription"
          defaultValue={
            seller.storeDescription
          }
          multiline
        />

        <Field
          label="Logo Image URL"
          name="logoUrl"
          defaultValue={
            seller.logoUrl
          }
        />

        />

        <button
          type="submit"
          style={
            saveButton
          }
        >
          Save Storefront
        </button>
      </Form>
    </Shell>
  );
}


function Shell({
  back,
  backLabel,
  title,
  subtitle,
  children,
}: {
  back: string;
  backLabel: string;
  title: string;
  subtitle: string;
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight:
          "100vh",
        background:
          "#faf8fc",
        padding:
          "28px 18px 70px",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth:
            "760px",
          margin:
            "0 auto",
        }}
      >
        <Link
          to={back}
          style={{
            color:
              "#4B1678",
            textDecoration:
              "none",
            fontWeight:
              "800",
            fontSize:
              "12px",
          }}
        >
          ← Back to {backLabel}
        </Link>

        <div
          style={{
            background:
              "white",
            border:
              "1px solid #e5dce9",
            borderRadius:
              "16px",
            padding:
              "24px",
            marginTop:
              "12px",
          }}
        >
          <h1
            style={{
              margin:
                0,
              color:
                "#4B1678",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              color:
                "#756b79",
              fontSize:
                "12px",
            }}
          >
            {subtitle}
          </p>

          {children}
        </div>
      </div>
    </div>
  );
}


function Field({
  label,
  name,
  defaultValue,
  multiline,
}: {
  label: string;
  name: string;
  defaultValue: string;
  multiline?: boolean;
}) {
  return (
    <label
      style={{
        display:
          "block",
        marginTop:
          "15px",
      }}
    >
      <div
        style={{
          color:
            "#4B1678",
          fontSize:
            "12px",
          fontWeight:
            "800",
          marginBottom:
            "6px",
        }}
      >
        {label}
      </div>

      {multiline ? (
        <textarea
          name={name}
          defaultValue={
            defaultValue
          }
          rows={
            5
          }
          style={{
            ...fieldStyle,
            resize:
              "vertical",
          }}
        />
      ) : (
        <input
          name={name}
          defaultValue={
            defaultValue
          }
          style={
            fieldStyle
          }
        />
      )}
    </label>
  );
}


function Notice({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        background:
          "#edf8ef",
        color:
          "#28743b",
        borderRadius:
          "9px",
        padding:
          "11px",
        fontSize:
          "12px",
        fontWeight:
          "700",
        marginTop:
          "14px",
      }}
    >
      {text}
    </div>
  );
}


const fieldStyle = {
  width:
    "100%",
  boxSizing:
    "border-box" as const,
  border:
    "1px solid #d8cce0",
  borderRadius:
    "9px",
  padding:
    "11px",
};

const saveButton = {
  border:
    0,
  background:
    "#4B1678",
  color:
    "white",
  borderRadius:
    "9px",
  padding:
    "12px 16px",
  fontWeight:
    "800",
  marginTop:
    "20px",
  cursor:
    "pointer",
};
