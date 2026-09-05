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
      email:
        seller.email ||
        "",
      phone:
        seller.phone ||
        "",
      city:
        seller.city ||
        "",
      state:
        seller.state ||
        "",
      postalCode:
        seller.postalCode ||
        "",
      sellsNationwide:
        seller.sellsNationwide,
      offersLocalPickup:
        seller.offersLocalPickup,
      offersLocalDelivery:
        seller.offersLocalDelivery,
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
      email:
        String(
          formData.get(
            "email",
          ) ||
          "",
        ).trim() ||
        null,

      phone:
        String(
          formData.get(
            "phone",
          ) ||
          "",
        ).trim() ||
        null,

      city:
        String(
          formData.get(
            "city",
          ) ||
          "",
        ).trim() ||
        null,

      state:
        String(
          formData.get(
            "state",
          ) ||
          "",
        ).trim() ||
        null,

      postalCode:
        String(
          formData.get(
            "postalCode",
          ) ||
          "",
        ).trim() ||
        null,

      sellsNationwide:
        formData.get(
          "sellsNationwide",
        ) ===
        "on",

      offersLocalPickup:
        formData.get(
          "offersLocalPickup",
        ) ===
        "on",

      offersLocalDelivery:
        formData.get(
          "offersLocalDelivery",
        ) ===
        "on",
    },
  });

  return {
    success:
      true,
    message:
      "Store settings saved.",
  };
};


export default function SellerSettingsPage() {
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
          to="/seller"
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
          ← Back to Dashboard
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
            Store Settings
          </h1>

          <p
            style={{
              color:
                "#756b79",
              fontSize:
                "12px",
            }}
          >
            Keep your business and fulfillment preferences current.
          </p>

          {actionData && (
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
              }}
            >
              {actionData.message}
            </div>
          )}

          <Form
            method="post"
          >
            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap:
                  "12px",
              }}
            >
              <Field
                label="Email"
                name="email"
                defaultValue={
                  seller.email
                }
              />

              <Field
                label="Phone"
                name="phone"
                defaultValue={
                  seller.phone
                }
              />

              <Field
                label="City"
                name="city"
                defaultValue={
                  seller.city
                }
              />

              <Field
                label="State"
                name="state"
                defaultValue={
                  seller.state
                }
              />

              <Field
                label="ZIP Code"
                name="postalCode"
                defaultValue={
                  seller.postalCode
                }
              />
            </div>

            <div
              style={{
                marginTop:
                  "22px",
                borderTop:
                  "1px solid #eee7f2",
                paddingTop:
                  "18px",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",
                  fontWeight:
                    "800",
                  marginBottom:
                    "10px",
                }}
              >
                Fulfillment
              </div>

              <Check
                name="sellsNationwide"
                label="Ships Nationwide"
                defaultChecked={
                  seller.sellsNationwide
                }
              />

              <Check
                name="offersLocalPickup"
                label="Offers Local Pickup"
                defaultChecked={
                  seller.offersLocalPickup
                }
              />

              <Check
                name="offersLocalDelivery"
                label="Offers Local Delivery"
                defaultChecked={
                  seller.offersLocalDelivery
                }
              />
            </div>

            <button
              type="submit"
              style={{
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
              }}
            >
              Save Settings
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}


function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label
      style={{
        display:
          "block",
        marginTop:
          "13px",
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

      <input
        name={name}
        defaultValue={
          defaultValue
        }
        style={{
          width:
            "100%",
          boxSizing:
            "border-box",
          border:
            "1px solid #d8cce0",
          borderRadius:
            "9px",
          padding:
            "11px",
        }}
      />
    </label>
  );
}


function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      style={{
        display:
          "block",
        marginTop:
          "9px",
        fontSize:
          "13px",
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={
          defaultChecked
        }
      />{" "}
      {label}
    </label>
  );
}
