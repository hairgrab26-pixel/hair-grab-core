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
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";


type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{
    name: string;
    value: string;
  }>;
};


async function getShopifyAdmin() {
  const offlineSession =
    await db.session.findFirst({
      where: {
        isOnline: false,
      },
    });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(
    offlineSession.shop,
  );
}


async function uploadStoreImage(
  file: File,
  altText: string,
) {
  const { admin } =
    await getShopifyAdmin();

  const stagedResponse =
    await admin.graphql(
      `#graphql
      mutation HairGrabStageStoreImage(
        $input: [StagedUploadInput!]!
      ) {
        stagedUploadsCreate(
          input: $input
        ) {
          stagedTargets {
            url
            resourceUrl

            parameters {
              name
              value
            }
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          input: [
            {
              filename:
                file.name,

              mimeType:
                file.type ||
                "image/jpeg",

              httpMethod:
                "POST",

              resource:
                "IMAGE",
            },
          ],
        },
      },
    );

  const stagedJson =
    await stagedResponse.json();

  const stagedResult =
    stagedJson?.data
      ?.stagedUploadsCreate;

  const stagedErrors =
    stagedResult
      ?.userErrors ||
    [];

  if (
    stagedErrors.length >
    0
  ) {
    throw new Error(
      stagedErrors
        .map(
          (error: {
            message?: string;
          }) =>
            error.message ||
            "Unable to prepare image upload.",
        )
        .join(" | "),
    );
  }

  const target =
    stagedResult
      ?.stagedTargets
      ?.[0] as
      | StagedTarget
      | undefined;

  if (
    !target?.url ||
    !target.resourceUrl
  ) {
    throw new Error(
      "Shopify did not return an image upload target.",
    );
  }

  const uploadForm =
    new FormData();

  for (
    const parameter of
    target.parameters
  ) {
    uploadForm.append(
      parameter.name,
      parameter.value,
    );
  }

  uploadForm.append(
    "file",
    file,
    file.name,
  );

  const uploadResponse =
    await fetch(
      target.url,
      {
        method:
          "POST",
        body:
          uploadForm,
      },
    );

  if (
    !uploadResponse.ok
  ) {
    throw new Error(
      `Upload failed for ${file.name}.`,
    );
  }

  const fileCreateResponse =
    await admin.graphql(
      `#graphql
      mutation HairGrabCreateStoreImage(
        $files: [FileCreateInput!]!
      ) {
        fileCreate(
          files: $files
        ) {
          files {
            id
            fileStatus

            ... on MediaImage {
              image {
                url
              }
            }
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          files: [
            {
              originalSource:
                target.resourceUrl,

              contentType:
                "IMAGE",

              alt:
                altText,
            },
          ],
        },
      },
    );

  const fileCreateJson =
    await fileCreateResponse.json();

  const fileCreateResult =
    fileCreateJson?.data
      ?.fileCreate;

  const fileErrors =
    fileCreateResult
      ?.userErrors ||
    [];

  if (
    fileErrors.length >
    0
  ) {
    throw new Error(
      fileErrors
        .map(
          (error: {
            message?: string;
          }) =>
            error.message ||
            "Unable to save uploaded image.",
        )
        .join(" | "),
    );
  }

  const fileId =
    fileCreateResult
      ?.files
      ?.[0]
      ?.id;

  let imageUrl =
    fileCreateResult
      ?.files
      ?.[0]
      ?.image
      ?.url ||
    null;

  if (!fileId) {
    throw new Error(
      "Shopify did not return the saved image.",
    );
  }

  // Shopify can take a moment to process a newly-created image.
  // Poll briefly so the seller gets a permanent CDN URL.
  for (
    let attempt = 0;
    !imageUrl &&
    attempt < 8;
    attempt += 1
  ) {
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          350,
        ),
    );

    const queryResponse =
      await admin.graphql(
        `#graphql
        query HairGrabStoreImageStatus(
          $id: ID!
        ) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus

              image {
                url
              }
            }
          }
        }
        `,
        {
          variables: {
            id:
              fileId,
          },
        },
      );

    const queryJson =
      await queryResponse.json();

    imageUrl =
      queryJson?.data
        ?.node
        ?.image
        ?.url ||
      null;
  }

  if (!imageUrl) {
    throw new Error(
      "The image uploaded, but Shopify is still processing it. Please try saving again in a moment.",
    );
  }

  return String(
    imageUrl,
  );
}


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

      storeSlug:
        seller.storeSlug ||
        "",

      storeDescription:
        seller.storeDescription ||
        "",

      logoUrl:
        seller.logoUrl ||
        "",

      bannerUrl:
        seller.bannerUrl ||
        "",

      email:
        seller.email ||
        "",

      phone:
        seller.phone ||
        "",

      address1:
        seller.address1 ||
        "",

      address2:
        seller.address2 ||
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

      offersSameDayDelivery:
        seller.offersSameDayDelivery,
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

  try {
    const formData =
      await request.formData();

    const logoFile =
      formData.get(
        "logoImage",
      );

    const bannerFile =
      formData.get(
        "bannerImage",
      );

    let logoUrl =
      seller.logoUrl;

    let bannerUrl =
      seller.bannerUrl;

    if (
      logoFile instanceof
        File &&
      logoFile.size >
        0
    ) {
      if (
        !logoFile.type.startsWith(
          "image/",
        )
      ) {
        return {
          success:
            false,
          message:
            "Your logo must be an image file.",
        };
      }

      logoUrl =
        await uploadStoreImage(
          logoFile,
          `${seller.businessName} logo`,
        );
    }

    if (
      bannerFile instanceof
        File &&
      bannerFile.size >
        0
    ) {
      if (
        !bannerFile.type.startsWith(
          "image/",
        )
      ) {
        return {
          success:
            false,
          message:
            "Your banner must be an image file.",
        };
      }

      bannerUrl =
        await uploadStoreImage(
          bannerFile,
          `${seller.businessName} storefront banner`,
        );
    }

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
          logoUrl ||
          null,

        bannerUrl:
          bannerUrl ||
          null,

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

        address1:
          String(
            formData.get(
              "address1",
            ) ||
            "",
          ).trim() ||
          null,

        address2:
          String(
            formData.get(
              "address2",
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

        offersSameDayDelivery:
          formData.get(
            "offersSameDayDelivery",
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
  } catch (error) {
    console.error(
      "[HairGrab Core] Store settings error:",
      error,
    );

    return {
      success:
        false,

      message:
        error instanceof
        Error
          ? error.message
          : "HairGrab could not save your store settings.",
    };
  }
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

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "840px",

          margin:
            "0 auto",
        }}
      >
        <Link
          to="/seller"
          style={
            backLinkStyle
          }
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
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              gap:
                "12px",

              alignItems:
                "start",

              flexWrap:
                "wrap",
            }}
          >
            <div>
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

                  marginBottom:
                    0,
                }}
              >
                Update your storefront, business details and fulfillment preferences.
              </p>
            </div>

            <Link
              to="/seller/store-preview"
              target="_blank"
              style={
                viewStoreButton
              }
            >
              View My Store ↗
            </Link>
          </div>

          {actionData && (
            <div
              style={{
                background:
                  actionData
                    .success
                    ? "#edf8ef"
                    : "#fff1f1",

                color:
                  actionData
                    .success
                    ? "#28743b"
                    : "#922f2f",

                borderRadius:
                  "9px",

                padding:
                  "11px",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                marginTop:
                  "16px",
              }}
            >
              {actionData.message}
            </div>
          )}

          <Form
            method="post"
            encType="multipart/form-data"
          >
            <Section
              title="Storefront"
              subtitle="These are the details shoppers will see on your HairGrab store."
            >
              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(240px, 1fr))",

                  gap:
                    "14px",
                }}
              >
                <ImageUpload
                  label="Store Logo"
                  name="logoImage"
                  currentUrl={
                    seller.logoUrl
                  }
                  help="Upload a square logo or brand image."
                />

                <ImageUpload
                  label="Banner Image"
                  name="bannerImage"
                  currentUrl={
                    seller.bannerUrl
                  }
                  help="Upload a wide image for the top of your storefront."
                  banner
                />
              </div>

              <Field
                label="Store Description"
                name="storeDescription"
                defaultValue={
                  seller.storeDescription
                }
                multiline
              />

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
                              </div>
            </Section>

            <Section
              title="Business Information"
              subtitle="Keep your HairGrab contact and location information current."
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
                  label="Street Address"
                  name="address1"
                  defaultValue={
                    seller.address1
                  }
                />

                <Field
                  label="Address Line 2 (Optional)"
                  name="address2"
                  defaultValue={
                    seller.address2
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
            </Section>

            <Section
              title="Fulfillment"
              subtitle="Choose how shoppers can receive products from your store."
            >
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

              <Check
                name="offersSameDayDelivery"
                label="Offers HairGrab Same-Day Delivery"
                defaultChecked={
                  seller.offersSameDayDelivery
                }
              />
            </Section>

            <button
              type="submit"
              style={
                saveButton
              }
            >
              Save Settings
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}


function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop:
          "24px",

        paddingTop:
          "22px",

        borderTop:
          "1px solid #eee7f2",
      }}
    >
      <div
        style={{
          color:
            "#4B1678",

          fontSize:
            "18px",

          fontWeight:
            "800",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "11px",

          marginTop:
            "4px",

          marginBottom:
            "14px",
        }}
      >
        {subtitle}
      </div>

      {children}
    </div>
  );
}


function ImageUpload({
  label,
  name,
  currentUrl,
  help,
  banner,
}: {
  label: string;
  name: string;
  currentUrl: string;
  help: string;
  banner?: boolean;
}) {
  return (
    <div>
      <div
        style={
          labelStyle
        }
      >
        {label}
      </div>

      <div
        style={{
          height:
            banner
              ? "120px"
              : "140px",

          border:
            "1px dashed #cdb9db",

          borderRadius:
            "11px",

          background:
            "#faf7fc",

          overflow:
            "hidden",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          marginBottom:
            "9px",
        }}
      >
        {currentUrl ? (
          <img
            src={
              currentUrl
            }
            alt={
              label
            }
            style={{
              width:
                "100%",

              height:
                "100%",

              objectFit:
                banner
                  ? "cover"
                  : "contain",
            }}
          />
        ) : (
          <div
            style={{
              color:
                "#8a7b91",

              fontSize:
                "12px",

              textAlign:
                "center",

              padding:
                "20px",
            }}
          >
            No {label.toLowerCase()} uploaded yet
          </div>
        )}
      </div>

      <input
        type="file"
        name={name}
        accept="image/*"
        style={{
          width:
            "100%",

          fontSize:
            "12px",
        }}
      />

      <div
        style={{
          color:
            "#8a7b91",

          fontSize:
            "10px",

          marginTop:
            "5px",
        }}
      >
        {help}
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
          "13px",
      }}
    >
      <div
        style={
          labelStyle
        }
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
          "10px",

        fontSize:
          "13px",

        fontWeight:
          "700",

        color:
          "#2b1b35",
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

  background:
    "#ffffff",
};


const labelStyle = {
  color:
    "#4B1678",

  fontSize:
    "12px",

  fontWeight:
    "800",

  marginBottom:
    "6px",
};


const backLinkStyle = {
  color:
    "#4B1678",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "12px",
};


const viewStoreButton = {
  background:
    "#ffffff",

  color:
    "#4B1678",

  border:
    "1px solid #cdb9db",

  borderRadius:
    "9px",

  padding:
    "10px 13px",

  textDecoration:
    "none",

  fontSize:
    "12px",

  fontWeight:
    "800",
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
    "24px",

  cursor:
    "pointer",
};
