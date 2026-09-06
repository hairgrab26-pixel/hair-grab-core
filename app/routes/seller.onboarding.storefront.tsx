import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  redirect,
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
      mutation HairGrabStageOnboardingImage(
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
    stagedResult?.userErrors ||
    [];

  if (
    stagedErrors.length >
    0
  ) {
    throw new Error(
      stagedErrors
        .map(
          (
            error: {
              message?: string;
            },
          ) =>
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
      mutation HairGrabCreateOnboardingImage(
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
    fileCreateResult?.userErrors ||
    [];

  if (
    fileErrors.length >
    0
  ) {
    throw new Error(
      fileErrors
        .map(
          (
            error: {
              message?: string;
            },
          ) =>
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
        query HairGrabOnboardingImageStatus(
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

  const onboarding =
    await db.sellerOnboarding.findUnique({
      where: {
        sellerId:
          seller.id,
      },
    });

  if (!onboarding) {
    throw new Response(
      "Seller onboarding record was not found.",
      {
        status:
          404,
      },
    );
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      logoUrl:
        seller.logoUrl ||
        "",

      bannerUrl:
        seller.bannerUrl ||
        "",

      storeDescription:
        seller.storeDescription ||
        "",
    },

    storefrontComplete:
      onboarding.storefrontComplete,
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

    const description =
      String(
        formData.get(
          "storeDescription",
        ) ||
        "",
      ).trim();

    if (
      description.length >
      300
    ) {
      return {
        success:
          false,

        message:
          "Keep your store description to 300 characters or less.",
      };
    }

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
            "Your store logo must be an image file.",
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

    if (!logoUrl) {
      return {
        success:
          false,

        message:
          "Please upload your store logo.",
      };
    }

    if (!bannerUrl) {
      return {
        success:
          false,

        message:
          "Please upload your storefront banner.",
      };
    }

    if (!description) {
      return {
        success:
          false,

        message:
          "Please add a short store description.",
      };
    }

    const now =
      new Date();

    await db.$transaction([
      db.seller.update({
        where: {
          id:
            seller.id,
        },

        data: {
          logoUrl,
          bannerUrl,

          storeDescription:
            description,
        },
      }),

      db.sellerOnboarding.update({
        where: {
          sellerId:
            seller.id,
        },

        data: {
          storefrontComplete:
            true,

          storefrontCompletedAt:
            now,

          currentStep:
            "FULFILLMENT",

          status:
            "IN_PROGRESS",

          lastSavedAt:
            now,
        },
      }),
    ]);

    return redirect(
      "/seller/onboarding",
    );
  } catch (error) {
    console.error(
      "[HairGrab Core] Storefront onboarding error:",
      error,
    );

    return {
      success:
        false,

      message:
        error instanceof Error
          ? error.message
          : "HairGrab could not save your storefront.",
    };
  }
};


export default function SellerStorefrontOnboardingPage() {
  const {
    seller,
    storefrontComplete,
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
            "760px",

          margin:
            "0 auto",
        }}
      >
        <Link
          to="/seller/onboarding"
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
          ← Back to Seller Setup
        </Link>

        <div
          style={{
            background:
              "#ffffff",

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
              color:
                "#7b3fa0",

              fontSize:
                "11px",

              fontWeight:
                "800",

              letterSpacing:
                "1px",

              textTransform:
                "uppercase",
            }}
          >
            HairGrab Seller Setup
          </div>

          <h1
            style={{
              color:
                "#4B1678",

              margin:
                "6px 0 5px",

              fontSize:
                "28px",
            }}
          >
            Build Your HairGrab Store
          </h1>

          <p
            style={{
              color:
                "#756b79",

              fontSize:
                "13px",

              lineHeight:
                1.6,

              margin:
                "0 0 18px",
            }}
          >
            Add the three things shoppers need to recognize your brand. You can update them later in Store Settings.
          </p>

          {storefrontComplete && (
            <div
              style={{
                background:
                  "#edf8ef",

                color:
                  "#28743b",

                padding:
                  "10px 12px",

                borderRadius:
                  "9px",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                marginBottom:
                  "16px",
              }}
            >
              Your storefront setup is already complete. You can make changes here if needed.
            </div>
          )}

          {actionData && (
            <div
              style={{
                background:
                  "#fff1f1",

                color:
                  "#922f2f",

                borderRadius:
                  "9px",

                padding:
                  "11px",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                marginBottom:
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
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit, minmax(240px, 1fr))",

                gap:
                  "16px",
              }}
            >
              <ImageUpload
                label="Store Logo"
                name="logoImage"
                currentUrl={
                  seller.logoUrl
                }
                help="Upload your logo or brand mark."
              />

              <ImageUpload
                label="Store Banner"
                name="bannerImage"
                currentUrl={
                  seller.bannerUrl
                }
                help="Upload a wide image that represents your brand."
                banner
              />
            </div>

            <label
              style={{
                display:
                  "block",

                marginTop:
                  "20px",
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
                Store Description
              </div>

              <div
                style={{
                  color:
                    "#817787",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.5,

                  marginBottom:
                    "7px",
                }}
              >
                Tell shoppers a little about your brand and what you offer. Keep it short and simple.
              </div>

              <textarea
                name="storeDescription"
                defaultValue={
                  seller.storeDescription
                }
                maxLength={
                  300
                }
                rows={
                  5
                }
                placeholder="Example: Luxury hair designed for confidence, versatility and everyday wear."
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
                    "12px",

                  resize:
                    "vertical",

                  fontFamily:
                    "Arial, sans-serif",
                }}
              />
            </label>

            <div
              style={{
                marginTop:
                  "22px",

                display:
                  "flex",

                gap:
                  "10px",

                flexWrap:
                  "wrap",
              }}
            >
              <button
                type="submit"
                style={{
                  border:
                    0,

                  background:
                    "#4B1678",

                  color:
                    "#ffffff",

                  borderRadius:
                    "9px",

                  padding:
                    "12px 17px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                Save & Continue
              </button>

              <Link
                to="/seller/store-preview"
                target="_blank"
                style={{
                  color:
                    "#4B1678",

                  border:
                    "1px solid #cdb9db",

                  borderRadius:
                    "9px",

                  padding:
                    "11px 14px",

                  textDecoration:
                    "none",

                  fontWeight:
                    "800",

                  fontSize:
                    "12px",

                  background:
                    "#ffffff",
                }}
              >
                Preview Store ↗
              </Link>
            </div>
          </Form>
        </div>
      </div>
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
