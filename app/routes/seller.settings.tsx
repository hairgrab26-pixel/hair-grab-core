import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import {
  useEffect,
  useState,
} from "react";

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

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

async function getShopifyAdmin() {
  const offlineSession = await db.session.findFirst({
    where: { isOnline: false },
  });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(offlineSession.shop);
}

async function uploadStoreImage(
  file: File,
  altText: string,
) {
  const { admin } = await getShopifyAdmin();

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation HairGrabStageStoreImage(
        $input: [StagedUploadInput!]!
      ) {
        stagedUploadsCreate(input: $input) {
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
            filename: file.name,
            mimeType: file.type || "image/jpeg",
            httpMethod: "POST",
            resource: "IMAGE",
          },
        ],
      },
    },
  );

  const stagedJson = await stagedResponse.json();
  const stagedResult =
    stagedJson?.data?.stagedUploadsCreate;
  const stagedErrors =
    stagedResult?.userErrors || [];

  if (stagedErrors.length > 0) {
    throw new Error(
      stagedErrors
        .map(
          (error: { message?: string }) =>
            error.message ||
            "Unable to prepare image upload.",
        )
        .join(" | "),
    );
  }

  const target = stagedResult?.stagedTargets?.[0] as
    | StagedTarget
    | undefined;

  if (!target?.url || !target.resourceUrl) {
    throw new Error(
      "Shopify did not return an image upload target.",
    );
  }

  const uploadForm = new FormData();

  for (const parameter of target.parameters) {
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

  const uploadResponse = await fetch(
    target.url,
    {
      method: "POST",
      body: uploadForm,
    },
  );

  if (!uploadResponse.ok) {
    throw new Error(
      `Upload failed for ${file.name}.`,
    );
  }

  const fileCreateResponse = await admin.graphql(
    `#graphql
      mutation HairGrabCreateStoreImage(
        $files: [FileCreateInput!]!
      ) {
        fileCreate(files: $files) {
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
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
            alt: altText,
          },
        ],
      },
    },
  );

  const fileCreateJson =
    await fileCreateResponse.json();
  const fileCreateResult =
    fileCreateJson?.data?.fileCreate;
  const fileErrors =
    fileCreateResult?.userErrors || [];

  if (fileErrors.length > 0) {
    throw new Error(
      fileErrors
        .map(
          (error: { message?: string }) =>
            error.message ||
            "Unable to save uploaded image.",
        )
        .join(" | "),
    );
  }

  const fileId =
    fileCreateResult?.files?.[0]?.id;

  let imageUrl =
    fileCreateResult?.files?.[0]?.image?.url ||
    null;

  if (!fileId) {
    throw new Error(
      "Shopify did not return the saved image.",
    );
  }

  for (
    let attempt = 0;
    !imageUrl && attempt < 8;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 350),
    );

    const queryResponse = await admin.graphql(
      `#graphql
        query HairGrabStoreImageStatus($id: ID!) {
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
      { variables: { id: fileId } },
    );

    const queryJson =
      await queryResponse.json();

    imageUrl =
      queryJson?.data?.node?.image?.url ||
      null;
  }

  if (!imageUrl) {
    throw new Error(
      "The image uploaded, but Shopify is still processing it. Please try saving again in a moment.",
    );
  }

  return String(imageUrl);
}


async function uploadStoreVideo(
  file: File,
  altText: string,
) {
  const { admin } = await getShopifyAdmin();

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation HairGrabStageStoreVideo(
        $input: [StagedUploadInput!]!
      ) {
        stagedUploadsCreate(input: $input) {
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
            filename: file.name,
            mimeType: file.type || "video/mp4",
            httpMethod: "POST",
            resource: "VIDEO",
          },
        ],
      },
    },
  );

  const stagedJson = await stagedResponse.json();
  const stagedResult =
    stagedJson?.data?.stagedUploadsCreate;
  const stagedErrors =
    stagedResult?.userErrors || [];

  if (stagedErrors.length > 0) {
    throw new Error(
      stagedErrors
        .map(
          (error: { message?: string }) =>
            error.message ||
            "Unable to prepare video upload.",
        )
        .join(" | "),
    );
  }

  const target = stagedResult?.stagedTargets?.[0] as
    | StagedTarget
    | undefined;

  if (!target?.url || !target.resourceUrl) {
    throw new Error(
      "Shopify did not return a video upload target.",
    );
  }

  const uploadForm = new FormData();

  for (const parameter of target.parameters) {
    uploadForm.append(
      parameter.name,
      parameter.value,
    );
  }

  uploadForm.append("file", file, file.name);

  const uploadResponse = await fetch(
    target.url,
    {
      method: "POST",
      body: uploadForm,
    },
  );

  if (!uploadResponse.ok) {
    throw new Error(
      `Upload failed for ${file.name}.`,
    );
  }

  const fileCreateResponse = await admin.graphql(
    `#graphql
      mutation HairGrabCreateStoreVideo(
        $files: [FileCreateInput!]!
      ) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
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
            originalSource: target.resourceUrl,
            contentType: "VIDEO",
            alt: altText,
          },
        ],
      },
    },
  );

  const fileCreateJson =
    await fileCreateResponse.json();
  const fileCreateResult =
    fileCreateJson?.data?.fileCreate;
  const fileErrors =
    fileCreateResult?.userErrors || [];

  if (fileErrors.length > 0) {
    throw new Error(
      fileErrors
        .map(
          (error: { message?: string }) =>
            error.message ||
            "Unable to save uploaded video.",
        )
        .join(" | "),
    );
  }

  const fileId =
    fileCreateResult?.files?.[0]?.id;

  if (!fileId) {
    throw new Error(
      "Shopify did not return the saved video.",
    );
  }

  let videoUrl: string | null = null;

  for (
    let attempt = 0;
    !videoUrl && attempt < 12;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 500),
    );

    const queryResponse = await admin.graphql(
      `#graphql
        query HairGrabStoreVideoStatus($id: ID!) {
          node(id: $id) {
            ... on Video {
              fileStatus
              sources {
                url
                mimeType
              }
            }
          }
        }
      `,
      { variables: { id: fileId } },
    );

    const queryJson =
      await queryResponse.json();

    videoUrl =
      queryJson?.data?.node?.sources?.[0]?.url ||
      null;
  }

  if (!videoUrl) {
    throw new Error(
      "The video uploaded, but Shopify is still processing it. Please try again in a moment.",
    );
  }

  return String(videoUrl);
}

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function uniqueCollectionSlug(
  sellerId: string,
  name: string,
  excludeId?: string,
) {
  const base = makeSlug(name) || "collection";
  let slug = base;
  let suffix = 2;

  while (
    await db.sellerStoreCollection.findFirst({
      where: {
        sellerId,
        slug,
        ...(excludeId
          ? { id: { not: excludeId } }
          : {}),
      },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(request);

  const [
    activeProducts,
    featuredProducts,
    featuredPicks,
    products,
    collections,
    media,
    hours,
  ] = await Promise.all([
    db.sellerProduct.count({
      where: {
        sellerId: seller.id,
        status: "ACTIVE",
      },
    }),

    db.sellerHomepagePick.count({
      where: { sellerId: seller.id },
    }),

    db.sellerHomepagePick.findMany({
      where: { sellerId: seller.id },
      select: { sellerProductId: true },
      orderBy: { rank: "asc" },
    }),

    db.sellerProduct.findMany({
      where: {
        sellerId: seller.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        title: true,
        shopifyHandle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    db.sellerStoreCollection.findMany({
      where: { sellerId: seller.id },
      include: {
        products: {
          orderBy: { rank: "asc" },
          select: {
            sellerProductId: true,
          },
        },
      },
      orderBy: [
        { rank: "asc" },
        { createdAt: "asc" },
      ],
    }),

    db.sellerStoreMedia.findMany({
      where: { sellerId: seller.id },
      orderBy: [
        { rank: "asc" },
        { createdAt: "asc" },
      ],
    }),

    db.sellerStoreHour.findMany({
      where: { sellerId: seller.id },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  const hourMap = new Map(
    hours.map((hour) => [
      hour.dayOfWeek,
      hour,
    ]),
  );

  return {
    seller: {
      businessName: seller.businessName,
      sellerCode: seller.sellerCode,
      storeSlug: seller.storeSlug || "",
      storeDescription:
        seller.storeDescription || "",
      logoUrl: seller.logoUrl || "",
      bannerUrl: seller.bannerUrl || "",
      businessPositioning:
        seller.businessPositioning || [],
      city: seller.city || "",
      state: seller.state || "",
      sellsNationwide:
        seller.sellsNationwide,
      offersLocalPickup:
        seller.offersLocalPickup,
      offersLocalDelivery:
        seller.offersLocalDelivery,
      offersSameDayDelivery:
        seller.offersSameDayDelivery,
      returnPolicy:
        seller.returnPolicy ||
        "14_DAY_RETURNS",
      showFeaturedCollection:
        seller.showFeaturedCollection,
      showNewArrivalsCollection:
        seller.showNewArrivalsCollection,
      showOnSaleCollection:
        seller.showOnSaleCollection,
      showCustomCollections:
        seller.showCustomCollections,
      showGallery:
        seller.showGallery,
      showReviews:
        seller.showReviews,
      useStoreHours:
        seller.useStoreHours,
      showStoreHours:
        seller.showStoreHours,
      showStoreStatus:
        seller.showStoreStatus,
      storeOpenOverride:
        seller.storeOpenOverride || "AUTO",
      storefrontPublished:
        seller.storefrontPublished,
    },

    stats: {
      activeProducts,
      featuredProducts,
      customCollections:
        collections.length,
    },

    products,

    featuredProductIds:
      featuredPicks.map((pick) => pick.sellerProductId),

    collections: collections.map(
      (collection) => ({
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        imageUrl:
          collection.imageUrl || "",
        isVisible:
          collection.isVisible,
        rank: collection.rank,
        productIds:
          collection.products.map(
            (item) =>
              item.sellerProductId,
          ),
      }),
    ),

    media: media.map((item) => ({
      id: item.id,
      mediaType: item.mediaType,
      url: item.url,
      altText: item.altText || "",
      isVisible: item.isVisible,
      rank: item.rank,
    })),

    hours: DAYS.map((day) => {
      const saved = hourMap.get(day.value);

      return {
        dayOfWeek: day.value,
        label: day.label,
        isClosed:
          saved?.isClosed ?? false,
        openTime:
          saved?.openTime || "09:00",
        closeTime:
          saved?.closeTime || "18:00",
      };
    }),
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(request);

  try {
    const formData =
      await request.formData();

    const intent = String(
      formData.get("intent") ||
        "saveStorefront",
    );

    if (intent === "saveStorefront") {
      const storeDescription = String(
        formData.get("storeDescription") ||
          "",
      ).trim();

      if (storeDescription.length > 600) {
        return {
          success: false,
          message:
            "Keep your About the Brand section to 600 characters or less.",
        };
      }

      const returnPolicy = String(
        formData.get("returnPolicy") ||
          "14_DAY_RETURNS",
      );

      if (
        ![
          "7_DAY_RETURNS",
          "14_DAY_RETURNS",
          "FINAL_SALE",
        ].includes(returnPolicy)
      ) {
        return {
          success: false,
          message:
            "Please choose a valid HairGrab return policy.",
        };
      }

      const allowedBusinessPositioning = [
        "LUXURY",
        "PREMIUM",
        "EVERYDAY",
        "VALUE",
        "CUSTOM_MADE_TO_ORDER",
      ];

      const businessPositioning = formData
        .getAll("businessPositioning")
        .map((value) => String(value))
        .filter((value) =>
          allowedBusinessPositioning.includes(value),
        );

      const alwaysOpen =
        formData.get("alwaysOpen") === "on";

      const storeOpenOverride = alwaysOpen
        ? "OPEN"
        : "AUTO";

      const sellsNationwide =
        formData.get("sellsNationwide") === "on";
      const offersLocalPickup =
        formData.get("offersLocalPickup") === "on";
      const offersLocalDelivery =
        formData.get("offersLocalDelivery") === "on";
      const offersSameDayDelivery =
        formData.get("offersSameDayDelivery") === "on";

      const wantsStoreLive =
        String(
          formData.get("storefrontVisibility") ||
            "HIDDEN",
        ) === "LIVE";

      const logoFile =
        formData.get("logoImage");
      const bannerFile =
        formData.get("bannerImage");

      let logoUrl = seller.logoUrl;
      let bannerUrl = seller.bannerUrl;

      if (
        logoFile instanceof File &&
        logoFile.size > 0
      ) {
        if (
          !logoFile.type.startsWith(
            "image/",
          )
        ) {
          return {
            success: false,
            message:
              "Your logo must be an image file.",
          };
        }

        logoUrl = await uploadStoreImage(
          logoFile,
          `${seller.businessName} logo`,
        );
      }

      if (
        bannerFile instanceof File &&
        bannerFile.size > 0
      ) {
        if (
          !bannerFile.type.startsWith(
            "image/",
          )
        ) {
          return {
            success: false,
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

      if (wantsStoreLive) {
        const missing: string[] = [];

        if (!logoUrl) missing.push("Store Logo");
        if (!bannerUrl) missing.push("Hero / Banner");
        if (!storeDescription) missing.push("About the Brand");

        const activeProductCount =
          await db.sellerProduct.count({
            where: {
              sellerId: seller.id,
              status: "ACTIVE",
            },
          });

        if (activeProductCount < 1) {
          missing.push("at least 1 Active Product");
        }

        if (
          !sellsNationwide &&
          !offersLocalPickup &&
          !offersLocalDelivery &&
          !offersSameDayDelivery
        ) {
          missing.push("a Fulfillment option");
        }

        if (missing.length > 0) {
          return {
            success: false,
            message:
              `Your store is still hidden. Complete: ${missing.join(", ")}.`,
          };
        }
      }

      await db.seller.update({
        where: { id: seller.id },
        data: {
          storeDescription:
            storeDescription || null,
          logoUrl: logoUrl || null,
          bannerUrl: bannerUrl || null,
          businessPositioning,
          sellsNationwide,
          offersLocalPickup,
          offersLocalDelivery,
          offersSameDayDelivery,
          storefrontPublished:
            wantsStoreLive,
          returnPolicy,
          useStoreHours: !alwaysOpen,
          showStoreHours:
            !alwaysOpen &&
            formData.get(
              "showStoreHours",
            ) === "on",
          showStoreStatus:
            formData.get(
              "showStoreStatus",
            ) === "on",
          storeOpenOverride,
        },
      });

      for (const day of DAYS) {
        const isClosed =
          formData.get(
            `day_${day.value}_closed`,
          ) === "on";

        const openTime = String(
          formData.get(
            `day_${day.value}_open`,
          ) || "",
        ).trim();

        const closeTime = String(
          formData.get(
            `day_${day.value}_close`,
          ) || "",
        ).trim();

        await db.sellerStoreHour.upsert({
          where: {
            sellerId_dayOfWeek: {
              sellerId: seller.id,
              dayOfWeek: day.value,
            },
          },
          update: {
            isClosed,
            openTime:
              isClosed || !openTime
                ? null
                : openTime,
            closeTime:
              isClosed || !closeTime
                ? null
                : closeTime,
          },
          create: {
            sellerId: seller.id,
            dayOfWeek: day.value,
            isClosed,
            openTime:
              isClosed || !openTime
                ? null
                : openTime,
            closeTime:
              isClosed || !closeTime
                ? null
                : closeTime,
          },
        });
      }

      return {
        success: true,
        message:
          "Your HairGrab storefront settings were saved.",
      };
    }

    if (intent === "saveStoreSections") {
      await db.seller.update({
        where: { id: seller.id },
        data: {
          showFeaturedCollection:
            formData.get(
              "showFeaturedCollection",
            ) === "on",
          showNewArrivalsCollection:
            formData.get(
              "showNewArrivalsCollection",
            ) === "on",
          showOnSaleCollection:
            formData.get(
              "showOnSaleCollection",
            ) === "on",
          showCustomCollections:
            formData.get(
              "showCustomCollections",
            ) === "on",
          showGallery:
            formData.get(
              "showGallery",
            ) === "on",
          showReviews:
            formData.get(
              "showReviews",
            ) === "on",
        },
      });

      return {
        success: true,
        message:
          "Your storefront sections were saved.",
      };
    }

    if (intent === "saveFeaturedProducts") {
      const requestedIds = formData
        .getAll("featuredProductIds")
        .map(String);

      const uniqueIds = Array.from(
        new Set(requestedIds),
      ).slice(0, 5);

      const validProducts =
        await db.sellerProduct.findMany({
          where: {
            sellerId: seller.id,
            status: "ACTIVE",
            id: { in: uniqueIds },
          },
          select: { id: true },
        });

      await db.$transaction([
        db.sellerHomepagePick.deleteMany({
          where: { sellerId: seller.id },
        }),
        db.sellerHomepagePick.createMany({
          data: validProducts.map(
            (product, index) => ({
              sellerId: seller.id,
              sellerProductId: product.id,
              rank: index + 1,
            }),
          ),
        }),
      ]);

      return {
        success: true,
        message:
          validProducts.length === 0
            ? "Featured Products cleared."
            : `${validProducts.length} Featured Product${validProducts.length === 1 ? "" : "s"} saved.`,
      };
    }

    if (intent === "createCollection") {
      const name = String(
        formData.get("collectionName") ||
          "",
      ).trim();

      if (!name) {
        return {
          success: false,
          message:
            "Enter a collection name.",
        };
      }

      if (name.length > 60) {
        return {
          success: false,
          message:
            "Keep collection names to 60 characters or less.",
        };
      }

      const imageFile =
        formData.get("collectionImage");

      let imageUrl: string | null = null;

      if (
        imageFile instanceof File &&
        imageFile.size > 0
      ) {
        if (
          !imageFile.type.startsWith(
            "image/",
          )
        ) {
          return {
            success: false,
            message:
              "Collection artwork must be an image file.",
          };
        }

        imageUrl = await uploadStoreImage(
          imageFile,
          `${seller.businessName} ${name} collection`,
        );
      }

      const productIds = formData
        .getAll("collectionProductIds")
        .map(String);

      const validProducts =
        await db.sellerProduct.findMany({
          where: {
            sellerId: seller.id,
            status: "ACTIVE",
            id: { in: productIds },
          },
          select: { id: true },
        });

      const rank =
        (await db.sellerStoreCollection.count(
          {
            where: {
              sellerId: seller.id,
            },
          },
        )) + 1;

      await db.sellerStoreCollection.create({
        data: {
          sellerId: seller.id,
          name,
          slug:
            await uniqueCollectionSlug(
              seller.id,
              name,
            ),
          imageUrl,
          isVisible: true,
          rank,
          products: {
            create: validProducts.map(
              (product, index) => ({
                sellerProductId:
                  product.id,
                rank: index + 1,
              }),
            ),
          },
        },
      });

      return {
        success: true,
        message: `"${name}" was added to your storefront.`,
      };
    }

    if (intent === "updateCollection") {
      const collectionId = String(
        formData.get("collectionId") ||
          "",
      );

      const collection =
        await db.sellerStoreCollection.findFirst(
          {
            where: {
              id: collectionId,
              sellerId: seller.id,
            },
          },
        );

      if (!collection) {
        return {
          success: false,
          message:
            "HairGrab could not find that collection.",
        };
      }

      const name = String(
        formData.get("collectionName") ||
          "",
      ).trim();

      if (!name) {
        return {
          success: false,
          message:
            "Enter a collection name.",
        };
      }

      const imageFile =
        formData.get("collectionImage");

      let imageUrl =
        collection.imageUrl;

      if (
        imageFile instanceof File &&
        imageFile.size > 0
      ) {
        if (
          !imageFile.type.startsWith(
            "image/",
          )
        ) {
          return {
            success: false,
            message:
              "Collection artwork must be an image file.",
          };
        }

        imageUrl = await uploadStoreImage(
          imageFile,
          `${seller.businessName} ${name} collection`,
        );
      }

      const productIds = formData
        .getAll("collectionProductIds")
        .map(String);

      const validProducts =
        await db.sellerProduct.findMany({
          where: {
            sellerId: seller.id,
            status: "ACTIVE",
            id: { in: productIds },
          },
          select: { id: true },
        });

      await db.$transaction([
        db.sellerStoreCollection.update({
          where: { id: collection.id },
          data: {
            name,
            slug:
              await uniqueCollectionSlug(
                seller.id,
                name,
                collection.id,
              ),
            imageUrl,
            isVisible:
              formData.get(
                "collectionVisible",
              ) === "on",
          },
        }),

        db.sellerStoreCollectionProduct.deleteMany(
          {
            where: {
              collectionId:
                collection.id,
            },
          },
        ),

        db.sellerStoreCollectionProduct.createMany(
          {
            data: validProducts.map(
              (product, index) => ({
                collectionId:
                  collection.id,
                sellerProductId:
                  product.id,
                rank: index + 1,
              }),
            ),
          },
        ),
      ]);

      return {
        success: true,
        message: `"${name}" was updated.`,
      };
    }

    if (intent === "deleteCollection") {
      const collectionId = String(
        formData.get("collectionId") ||
          "",
      );

      const collection =
        await db.sellerStoreCollection.findFirst(
          {
            where: {
              id: collectionId,
              sellerId: seller.id,
            },
            select: {
              id: true,
              name: true,
            },
          },
        );

      if (!collection) {
        return {
          success: false,
          message:
            "HairGrab could not find that collection.",
        };
      }

      await db.sellerStoreCollection.delete({
        where: { id: collection.id },
      });

      return {
        success: true,
        message: `"${collection.name}" was removed.`,
      };
    }

    if (intent === "addGalleryImage") {
      const imageFile =
        formData.get("galleryImage");

      if (
        !(imageFile instanceof File) ||
        imageFile.size === 0
      ) {
        return {
          success: false,
          message:
            "Choose an image to add to your gallery.",
        };
      }

      if (
        !imageFile.type.startsWith(
          "image/",
        )
      ) {
        return {
          success: false,
          message:
            "Gallery media must be an image file.",
        };
      }

      const imageUrl =
        await uploadStoreImage(
          imageFile,
          `${seller.businessName} storefront gallery`,
        );

      const rank =
        (await db.sellerStoreMedia.count({
          where: {
            sellerId: seller.id,
          },
        })) + 1;

      await db.sellerStoreMedia.create({
        data: {
          sellerId: seller.id,
          mediaType: "IMAGE",
          url: imageUrl,
          altText: `${seller.businessName} storefront gallery`,
          isVisible: true,
          rank,
        },
      });

      return {
        success: true,
        message:
          "Gallery image added.",
      };
    }

    if (intent === "addVideo") {
      const videoFile =
        formData.get("videoFile");

      if (
        !(videoFile instanceof File) ||
        videoFile.size === 0
      ) {
        return {
          success: false,
          message:
            "Choose a video to upload.",
        };
      }

      if (
        !videoFile.type.startsWith(
          "video/",
        )
      ) {
        return {
          success: false,
          message:
            "Your storefront video must be a video file.",
        };
      }

      const videoUrl =
        await uploadStoreVideo(
          videoFile,
          `${seller.businessName} storefront video`,
        );

      const rank =
        (await db.sellerStoreMedia.count({
          where: {
            sellerId: seller.id,
          },
        })) + 1;

      await db.sellerStoreMedia.create({
        data: {
          sellerId: seller.id,
          mediaType: "VIDEO",
          url: videoUrl,
          altText: `${seller.businessName} storefront video`,
          isVisible: true,
          rank,
        },
      });

      return {
        success: true,
        message:
          "Storefront video uploaded.",
      };
    }

    if (intent === "toggleMedia") {
      const mediaId = String(
        formData.get("mediaId") || "",
      );

      const media =
        await db.sellerStoreMedia.findFirst({
          where: {
            id: mediaId,
            sellerId: seller.id,
          },
        });

      if (!media) {
        return {
          success: false,
          message:
            "HairGrab could not find that media item.",
        };
      }

      await db.sellerStoreMedia.update({
        where: { id: media.id },
        data: {
          isVisible: !media.isVisible,
        },
      });

      return {
        success: true,
        message:
          media.isVisible
            ? "Media hidden from your storefront."
            : "Media is now visible on your storefront.",
      };
    }

    if (intent === "deleteMedia") {
      const mediaId = String(
        formData.get("mediaId") || "",
      );

      const media =
        await db.sellerStoreMedia.findFirst({
          where: {
            id: mediaId,
            sellerId: seller.id,
          },
          select: { id: true },
        });

      if (!media) {
        return {
          success: false,
          message:
            "HairGrab could not find that media item.",
        };
      }

      await db.sellerStoreMedia.delete({
        where: { id: media.id },
      });

      return {
        success: true,
        message:
          "Media removed from your storefront.",
      };
    }

    return {
      success: false,
      message:
        "HairGrab did not recognize that storefront action.",
    };
  } catch (error) {
    console.error(
      "[HairGrab Core] Storefront error:",
      error,
    );

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "HairGrab could not save your storefront.",
    };
  }
};

export default function SellerSettingsPage() {
  const {
    seller,
    stats,
    products,
    featuredProductIds,
    collections,
    media,
    hours,
  } = useLoaderData<typeof loader>();

  const actionData =
    useActionData<typeof action>();

  const navigation = useNavigation();

  const isSavingStore =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") ===
      "saveStorefront";

  const storeSaveSucceeded =
    navigation.state === "idle" &&
    actionData?.success === true &&
    actionData?.message ===
      "Your HairGrab storefront settings were saved.";

  // Every "3. Build Your Storefront" control (Storefront Sections,
  // Featured Products, Custom Collections) is its own separate
  // <Form>, but the page only ever showed ONE success/error banner
  // near the very top of this long page. A seller who saves one of
  // those forms while scrolled down to "Build Your Storefront"
  // never sees that banner without scrolling back up — the save
  // may have worked perfectly, but there is zero visible proof of
  // it right where they are. Track which intent was last submitted
  // so each form can show its own inline result next to its own
  // button, without changing anything about how saving works.
  const [
    lastSubmittedIntent,
    setLastSubmittedIntent,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    if (
      navigation.state ===
        "submitting" &&
      navigation.formData
    ) {
      const submittedIntent =
        navigation.formData.get(
          "intent",
        );

      if (
        typeof submittedIntent ===
        "string"
      ) {
        setLastSubmittedIntent(
          submittedIntent,
        );
      }
    }
  }, [
    navigation.state,
    navigation.formData,
  ]);

  const hasBrandBasics =
    Boolean(seller.storeDescription) &&
    Boolean(seller.logoUrl) &&
    Boolean(seller.bannerUrl);

  const hasFulfillment =
    seller.sellsNationwide ||
    seller.offersLocalPickup ||
    seller.offersLocalDelivery ||
    seller.offersSameDayDelivery;

  const setupItems = [
    {
      label: "Brand",
      complete: hasBrandBasics,
      detail: "About, logo and banner",
    },
    {
      label: "Fulfillment",
      complete: hasFulfillment,
      detail: "At least one delivery option",
    },
    {
      label: "Returns",
      complete: Boolean(seller.returnPolicy),
      detail: "Return policy selected",
    },
    {
      label: "Products",
      complete: stats.activeProducts > 0,
      detail:
        stats.activeProducts > 0
          ? `${stats.activeProducts} Active`
          : "Add your first Active product",
    },
    {
      label: "Store",
      complete: seller.storefrontPublished,
      detail: seller.storefrontPublished
        ? "Live to shoppers"
        : "Hidden until you publish",
    },
  ];

  const completedSetupItems =
    setupItems.filter((item) => item.complete).length;

  return (
    <div className="hg-page">
      <style>{`
        * { box-sizing: border-box; }

        .hg-page {
          min-height: 100vh;
          background: #F7F2FA;
          color: #21152a;
          font-family: Arial, Helvetica, sans-serif;
        }

        .hg-header {
          background: #4B1678;
          color: white;
          padding: 20px 22px;
        }

        .hg-header-inner,
        .hg-main {
          max-width: 1080px;
          margin: 0 auto;
        }

        .hg-header-inner,
        .hg-top,
        .hg-sticky {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .hg-main {
          padding: 28px 20px 80px;
        }

        .hg-title {
          margin: 5px 0;
          color: #4B1678;
          font-size: 34px;
          line-height: 1.08;
        }

        .hg-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .hg-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin: 18px 0 22px;
        }

        .hg-setup {
          background: white;
          border: 1px solid #e5dce9;
          border-radius: 15px;
          padding: 16px;
          margin: 18px 0 22px;
          box-shadow: 0 3px 12px rgba(45,27,54,.035);
        }

        .hg-setup-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .hg-setup-title {
          color: #4B1678;
          font-size: 15px;
          font-weight: 900;
        }

        .hg-setup-count {
          color: #4B1678;
          font-size: 11px;
          font-weight: 900;
          background: #f2eafa;
          border: 1px solid #e2d1ef;
          border-radius: 999px;
          padding: 6px 9px;
        }

        .hg-setup-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .hg-setup-item {
          border: 1px solid #eee7f2;
          border-radius: 10px;
          padding: 10px;
          min-height: 70px;
          background: #fbf9fc;
        }

        .hg-setup-item strong {
          display: block;
          font-size: 11px;
          color: #35263e;
          margin-bottom: 4px;
        }

        .hg-setup-item span {
          display: block;
          color: #817686;
          font-size: 9px;
          line-height: 1.35;
        }

        .hg-section-heading {
          grid-column: 1 / -1;
          margin-top: 8px;
          padding: 4px 2px 0;
        }

        .hg-section-heading h2 {
          margin: 0;
          color: #4B1678;
          font-size: 20px;
        }

        .hg-section-heading p {
          margin: 4px 0 0;
          color: #756b79;
          font-size: 11px;
          line-height: 1.45;
        }

        .hg-span-2 {
          grid-column: 1 / -1;
        }

        .hg-hours-details {
          margin-top: 12px;
          border: 1px solid #e7dced;
          border-radius: 10px;
          overflow: hidden;
        }

        .hg-hours-details summary {
          cursor: pointer;
          list-style: none;
          padding: 12px;
          color: #4B1678;
          font-size: 11px;
          font-weight: 900;
          background: #fbf9fc;
        }

        .hg-hours-details summary::-webkit-details-marker {
          display: none;
        }

        .hg-hours-details-body {
          padding: 0 12px 10px;
        }

        .hg-card {
          background: white;
          border: 1px solid #e5dce9;
          border-radius: 15px;
          padding: 18px;
          box-shadow: 0 3px 12px rgba(45,27,54,.035);
        }

        .hg-card h2 {
          margin: 0;
          color: #4B1678;
          font-size: 17px;
        }

        .hg-subtitle {
          color: #756b79;
          font-size: 11px;
          line-height: 1.45;
          margin: 4px 0 14px;
        }

        .hg-label {
          color: #4B1678;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .hg-field {
          width: 100%;
          border: 1px solid #d8cce0;
          border-radius: 9px;
          padding: 11px;
          background: white;
          color: #21152a;
          font-size: 12px;
        }

        .hg-check {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid #f0e9f3;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          color: #35263e;
        }

        .hg-check input {
          width: 17px;
          height: 17px;
          accent-color: #4B1678;
        }

        .hg-info {
          margin-top: 13px;
          background: #F7F2FA;
          border: 1px solid #e2d1ef;
          border-radius: 10px;
          padding: 10px;
          color: #6f6575;
          font-size: 10px;
          line-height: 1.5;
        }

        .hg-button {
          border: 0;
          background: #4B1678;
          color: white;
          border-radius: 9px;
          padding: 12px 17px;
          font-weight: 900;
          font-size: 12px;
          cursor: pointer;
        }

        .hg-button-secondary {
          background: white;
          color: #4B1678;
          border: 1px solid #cdb9db;
        }

        .hg-button-danger {
          background: white;
          color: #922f2f;
          border: 1px solid #efcaca;
        }

        .hg-image-box {
          width: 100%;
          aspect-ratio: 1 / 1;
          min-height: 140px;
          max-height: 220px;
          border: 1px dashed #cdb9db;
          border-radius: 11px;
          background: #faf7fc;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 9px;
        }

        .hg-image-box.banner {
          aspect-ratio: 4 / 1;
          min-height: 120px;
          max-height: 220px;
        }

        .hg-image-box img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .hg-image-box.banner img {
          object-fit: cover;
        }

        .hg-collection {
          border: 1px solid #eadff0;
          border-radius: 12px;
          padding: 13px;
          margin-top: 12px;
        }

        .hg-products {
          max-height: 210px;
          overflow: auto;
          border: 1px solid #eee7f2;
          border-radius: 9px;
          padding: 8px;
          margin-top: 9px;
        }

        .hg-product-check {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          padding: 7px 4px;
          font-size: 11px;
          border-bottom: 1px solid #f4eef6;
        }

        .hg-system-collection {
          border: 1px solid #eadff0;
          border-radius: 11px;
          padding: 12px;
          margin-top: 9px;
          background: #fbf9fc;
        }

        .hg-system-collection-title {
          color: #4B1678;
          font-size: 12px;
          font-weight: 900;
        }

        .hg-system-collection-text {
          color: #756b79;
          font-size: 10px;
          line-height: 1.45;
          margin-top: 3px;
        }

        .hg-visibility-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .hg-visibility-option {
          border: 1px solid #dfd2e6;
          border-radius: 12px;
          padding: 13px;
          cursor: pointer;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          background: #fff;
        }

        .hg-visibility-option input {
          width: 18px;
          height: 18px;
          accent-color: #4B1678;
          flex: 0 0 auto;
          margin-top: 1px;
        }

        .hg-hours-row {
          display: grid;
          grid-template-columns: 95px 1fr 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f0e9f3;
        }

        .hg-media-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .hg-media-item {
          border: 1px solid #eadff0;
          border-radius: 11px;
          overflow: hidden;
          background: #faf7fc;
        }

        .hg-media-item img {
          width: 100%;
          height: 130px;
          object-fit: cover;
          display: block;
        }

        .hg-media-actions {
          padding: 8px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .hg-mini-button {
          border: 1px solid #d8cce0;
          background: white;
          color: #4B1678;
          border-radius: 7px;
          padding: 6px 8px;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .hg-sticky {
          position: sticky;
          bottom: 12px;
          margin-top: 18px;
          background: rgba(247,242,250,.94);
          backdrop-filter: blur(8px);
          border: 1px solid #e2d1ef;
          border-radius: 13px;
          padding: 10px;
          z-index: 5;
        }

        @media (max-width: 720px) {
          .hg-header {
            padding: 18px 16px;
          }

          .hg-main {
            padding: 20px 14px 70px;
          }

          .hg-title {
            font-size: 27px;
          }

          .hg-grid {
            grid-template-columns: 1fr;
          }

          .hg-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .hg-setup-grid {
            grid-template-columns: 1fr 1fr;
          }

          .hg-span-2 {
            grid-column: 1;
          }

          .hg-section-heading {
            grid-column: 1;
          }

          .hg-preview-button {
            width: 100%;
            justify-content: center;
          }

          .hg-hours-row {
            grid-template-columns: 1fr 1fr;
          }

          .hg-hours-day {
            grid-column: 1 / -1;
          }

          .hg-media-grid {
            grid-template-columns: 1fr;
          }

          .hg-visibility-grid {
            grid-template-columns: 1fr;
          }

          .hg-button {
            min-height: 44px;
          }

          .hg-product-check {
            min-height: 44px;
            align-items: center;
            padding: 10px 6px;
          }

          .hg-product-check input {
            width: 19px;
            height: 19px;
            flex: 0 0 auto;
          }
        }
      `}</style>

      <header className="hg-header">
        <div className="hg-header-inner">
          <div>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "1px",
                opacity: 0.82,
              }}
            >
              HAIRGRAB SELLER
            </div>

            <div
              style={{
                fontSize: "22px",
                fontWeight: 900,
                marginTop: "3px",
              }}
            >
              Storefront
            </div>
          </div>

          <Link
            to="/seller"
            style={{
              color: "white",
              textDecoration: "none",
              fontWeight: 800,
              fontSize: "12px",
            }}
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="hg-main">
        <div className="hg-top">
          <div>
            <div
              style={{
                color: "#756b79",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              {seller.sellerCode}
            </div>

            <h1 className="hg-title">
              Build Your Store
            </h1>

            <div
              style={{
                color: "#756b79",
                fontSize: "13px",
                lineHeight: 1.5,
                maxWidth: "650px",
              }}
            >
              HairGrab builds the storefront for you.
              Customize what shoppers see without
              building pages or menus.
            </div>
          </div>

          <Link
            className="hg-preview-button hg-button"
            to="/seller/store-preview"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              boxShadow:
                "0 5px 14px rgba(75,22,120,.15)",
            }}
          >
            Preview Store →
          </Link>
        </div>

        {actionData && (
          <Notice
            success={actionData.success}
            text={actionData.message}
          />
        )}

        <div className="hg-setup">
          <div className="hg-setup-head">
            <div>
              <div className="hg-setup-title">
                Store Setup
              </div>
              <div
                style={{
                  color: "#756b79",
                  fontSize: "10px",
                  marginTop: "3px",
                }}
              >
                Finish the essentials, then publish when you are ready.
              </div>
            </div>

            <div className="hg-setup-count">
              {completedSetupItems}/5 complete
            </div>
          </div>

          <div className="hg-setup-grid">
            {setupItems.map((item) => (
              <div
                className="hg-setup-item"
                key={item.label}
              >
                <strong>
                  {item.complete ? "✓" : "○"}{" "}
                  {item.label}
                </strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <Form
          method="post"
          encType="multipart/form-data"
        >
          <input
            type="hidden"
            name="intent"
            value="saveStorefront"
          />

          <div className="hg-grid">
            <div className="hg-section-heading">
              <h2>1. Brand & Store Status</h2>
              <p>
                Set up how your business appears on HairGrab and decide when shoppers can see it.
              </p>
            </div>

            <Card
                          title="Store Visibility"
                          subtitle="Control whether shoppers can see your storefront. Hidden does not deactivate your seller account."
                        >
                          <div className="hg-visibility-grid">
                            <label className="hg-visibility-option">
                              <input
                                type="radio"
                                name="storefrontVisibility"
                                value="LIVE"
                                defaultChecked={
                                  seller.storefrontPublished
                                }
                              />
                              <span>
                                <strong
                                  style={{
                                    color: "#28743b",
                                    fontSize: "12px",
                                  }}
                                >
                                  Live
                                </strong>
                                <span
                                  style={{
                                    display: "block",
                                    color: "#756b79",
                                    fontSize: "10px",
                                    lineHeight: 1.45,
                                    marginTop: "3px",
                                  }}
                                >
                                  Shoppers can find and open your HairGrab store.
                                </span>
                              </span>
                            </label>

                            <label className="hg-visibility-option">
                              <input
                                type="radio"
                                name="storefrontVisibility"
                                value="HIDDEN"
                                defaultChecked={
                                  !seller.storefrontPublished
                                }
                              />
                              <span>
                                <strong
                                  style={{
                                    color: "#4B1678",
                                    fontSize: "12px",
                                  }}
                                >
                                  Hidden
                                </strong>
                                <span
                                  style={{
                                    display: "block",
                                    color: "#756b79",
                                    fontSize: "10px",
                                    lineHeight: 1.45,
                                    marginTop: "3px",
                                  }}
                                >
                                  Keep your storefront off the public marketplace while you finish setup or take a temporary pause.
                                </span>
                              </span>
                            </label>
                          </div>

                          <InfoBox>
                            To go Live, HairGrab requires a Store Logo, Hero / Banner, About the Brand, at least 1 Active Product, a fulfillment option, and a return policy. If anything is missing, HairGrab will keep the store Hidden and tell you exactly what to finish.
                          </InfoBox>
                        </Card>

            <Card
                          title="Brand & About"
                          subtitle="What shoppers see first."
                        >
                          <Field
                            label="About the Brand"
                            name="storeDescription"
                            defaultValue={
                              seller.storeDescription
                            }
                            multiline
                            help="Keep it short and easy to scan. Maximum 600 characters."
                          />

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: "12px",
                              marginTop: "14px",
                            }}
                          >
                            <ImageUpload
                              label="Store Logo"
                              name="logoImage"
                              currentUrl={seller.logoUrl}
                              help="Recommended size: 1000 × 1000 px (square). Use a clear logo with space around the edges."
                            />

                            <ImageUpload
                              label="Hero / Banner"
                              name="bannerImage"
                              currentUrl={
                                seller.bannerUrl
                              }
                              help="Recommended size: 1800 × 450 px (4:1). Keep important text, logos, and faces centered for the best desktop and mobile display."
                              banner
                            />
                          </div>
                        </Card>

            <div className="hg-span-2">
              <Card
                            title="Business Positioning"
                            subtitle="Help HairGrab understand your business and help shoppers discover stores that fit what they are looking for. Select all that apply."
                          >
                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                              }}
                            >
                              {[
                                {
                                  value: "LUXURY",
                                  label: "Luxury Hair",
                                  description:
                                    "High-end hair business focused on exceptional quality, craftsmanship, customization, and/or an elevated shopping experience. Typically carries products in HairGrab's higher price ranges.",
                                },
                                {
                                  value: "PREMIUM",
                                  label: "Premium Hair",
                                  description:
                                    "Higher-quality hair and construction positioned above everyday or value offerings, without necessarily being luxury-priced.",
                                },
                                {
                                  value: "EVERYDAY",
                                  label: "Everyday Hair",
                                  description:
                                    "Hair designed for regular wear at accessible mid-range prices, balancing quality and affordability.",
                                },
                                {
                                  value: "VALUE",
                                  label: "Value Hair",
                                  description:
                                    "Budget-conscious hair focused on affordability and accessible pricing. Value does not mean low quality.",
                                },
                                {
                                  value: "CUSTOM_MADE_TO_ORDER",
                                  label: "Custom / Made-to-Order",
                                  description:
                                    "Specializes in products made, colored, constructed, customized, or prepared specifically for the shopper.",
                                },
                              ].map((option) => (
                                <label
                                  key={option.value}
                                  className="hg-check"
                                  style={{
                                    alignItems: "flex-start",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    name="businessPositioning"
                                    value={option.value}
                                    defaultChecked={seller.businessPositioning.includes(
                                      option.value,
                                    )}
                                    style={{
                                      accentColor: "#4B1678",
                                      marginTop: "3px",
                                    }}
                                  />
                                  <span>
                                    <strong>{option.label}</strong>
                                    <span
                                      style={{
                                        display: "block",
                                        color: "#756b79",
                                        fontSize: "10px",
                                        fontWeight: 400,
                                        lineHeight: 1.45,
                                        marginTop: "2px",
                                      }}
                                    >
                                      {option.description}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>

                            <InfoBox>
                              Select every option that genuinely describes your business.
                              These selections describe your store, not every product you sell.
                              HairGrab may classify individual products separately using product type,
                              price, and other marketplace criteria.
                            </InfoBox>
                          </Card>
            </div>

            <div className="hg-section-heading">
              <h2>2. How You Sell</h2>
              <p>
                Set your fulfillment, return policy, and availability.
              </p>
            </div>

            <Card
                          title="Shipping & Fulfillment"
                          subtitle="These become shopper-facing store badges."
                        >
                          <CheckRow
                            name="sellsNationwide"
                            defaultChecked={
                              seller.sellsNationwide
                            }
                            label="Nationwide Shipping"
                          />
                          <CheckRow
                            name="offersLocalPickup"
                            defaultChecked={
                              seller.offersLocalPickup
                            }
                            label="Local Pickup"
                          />
                          <CheckRow
                            name="offersLocalDelivery"
                            defaultChecked={
                              seller.offersLocalDelivery
                            }
                            label="Local Delivery"
                          />
                          <CheckRow
                            name="offersSameDayDelivery"
                            defaultChecked={
                              seller.offersSameDayDelivery
                            }
                            label="Same-Day Delivery"
                          />

                          {(seller.city ||
                            seller.state) && (
                            <div
                              style={{
                                marginTop: "12px",
                                color: "#756b79",
                                fontSize: "11px",
                              }}
                            >
                              Store location shown to
                              shoppers:{" "}
                              {[
                                seller.city,
                                seller.state,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                          )}
                        </Card>

            <Card
                          title="Returns"
                          subtitle="Choose the return window you offer shoppers."
                        >
                          <label>
                            <div className="hg-label">
                              Return Policy
                            </div>
                            <select
                              name="returnPolicy"
                              defaultValue={
                                seller.returnPolicy
                              }
                              className="hg-field"
                            >
                              <option value="FINAL_SALE">
                                Final Sale
                              </option>
                              <option value="7_DAY_RETURNS">
                                7-Day Returns
                              </option>
                              <option value="14_DAY_RETURNS">
                                14-Day Returns
                              </option>
                            </select>
                          </label>
                        </Card>

            <div className="hg-span-2">
              <Card
                            title="Store Hours & Availability"
                            subtitle="Choose Always Open or set weekly hours. HairGrab keeps this simple."
                          >
                            <label className="hg-check">
                              <input
                                type="checkbox"
                                name="alwaysOpen"
                                defaultChecked={
                                  seller.storeOpenOverride === "OPEN"
                                }
                                style={{
                                  accentColor: "#4B1678",
                                }}
                              />
                              <span>
                                <strong>Always Open — 24/7</strong>
                                <span
                                  style={{
                                    display: "block",
                                    color: "#756b79",
                                    fontSize: "10px",
                                    fontWeight: 400,
                                    marginTop: "2px",
                                  }}
                                >
                                  Choose this if you do not want HairGrab to use weekly business hours.
                                </span>
                              </span>
                            </label>

                            <CheckRow
                              name="showStoreStatus"
                              defaultChecked={
                                seller.showStoreStatus
                              }
                              label="Show Open / Closed status to shoppers"
                            />

                            <CheckRow
                              name="showStoreHours"
                              defaultChecked={
                                seller.showStoreHours
                              }
                              label="Show my weekly hours to shoppers"
                            />

                            <InfoBox>
                              If Always Open is off, HairGrab follows the weekly hours below.
                              These hours mainly guide local pickup, local delivery, and same-day availability.
                              Nationwide shipping remains available based on each product.
                            </InfoBox>

                            <details className="hg-hours-details">
                              <summary>
                                Edit Weekly Hours ▾
                              </summary>
                              <div className="hg-hours-details-body">
                                {hours.map((hour) => (
                                <div
                                  className="hg-hours-row"
                                  key={hour.dayOfWeek}
                                >
                                  <strong className="hg-hours-day">
                                    {hour.label}
                                  </strong>

                                  <input
                                    type="time"
                                    name={`day_${hour.dayOfWeek}_open`}
                                    defaultValue={
                                      hour.openTime
                                    }
                                    className="hg-field"
                                  />

                                  <input
                                    type="time"
                                    name={`day_${hour.dayOfWeek}_close`}
                                    defaultValue={
                                      hour.closeTime
                                    }
                                    className="hg-field"
                                  />

                                  <label
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 800,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      name={`day_${hour.dayOfWeek}_closed`}
                                      defaultChecked={
                                        hour.isClosed
                                      }
                                      style={{
                                        accentColor: "#4B1678",
                                      }}
                                    />{" "}
                                    Closed
                                  </label>
                                </div>
                                ))}
                              </div>
                            </details>
                          </Card>
            </div>
          </div>

          <div className="hg-sticky">
            <div
              style={{
                color: "#756b79",
                fontSize: "11px",
              }}
            >
              {isSavingStore
                ? "Saving your changes…"
                : storeSaveSucceeded
                  ? "✓ Your store basics were saved successfully."
                  : "Save your brand, selling, and availability settings."}
            </div>

            <button
              type="submit"
              className="hg-button"
              disabled={isSavingStore}
              style={{
                minWidth: "150px",
                opacity: isSavingStore ? 0.75 : 1,
              }}
            >
              {isSavingStore
                ? "Saving…"
                : storeSaveSucceeded
                  ? "✓ Saved"
                  : "Save Store Basics"}
            </button>
          </div>
        </Form>

        <div className="hg-section-heading" style={{ marginTop: "24px" }}>
          <h2>3. Build Your Storefront</h2>
          <p>
            Decide what shoppers see, then choose Featured Products and build any Custom Collections you want.
          </p>
        </div>

        <div
          className="hg-grid"
          style={{ marginTop: "12px" }}
        >
          <Form method="post" className="hg-span-2">
            <input
              type="hidden"
              name="intent"
              value="saveStoreSections"
            />

            <Card
                          title="Storefront Sections"
                          subtitle="Choose which storefront sections shoppers see. HairGrab fills the automatic sections for you."
                        >
                          <div className="hg-system-collection">
                            <div className="hg-system-collection-title">
                              Shop All — Automatic
                            </div>
                            <div className="hg-system-collection-text">
                              Every Active HairGrab product appears here automatically. You never have to build this collection.
                            </div>
                          </div>

                          <div className="hg-system-collection">
                            <div className="hg-system-collection-title">
                              New Arrivals — Automatic
                            </div>
                            <div className="hg-system-collection-text">
                              HairGrab automatically fills this with your newest Active products.
                            </div>
                            <CheckRow
                              name="showNewArrivalsCollection"
                              defaultChecked={
                                seller.showNewArrivalsCollection
                              }
                              label="Show New Arrivals on my store"
                            />
                          </div>

                          <div className="hg-system-collection">
                            <div className="hg-system-collection-title">
                              On Sale — Automatic
                            </div>
                            <div className="hg-system-collection-text">
                              HairGrab automatically adds products that currently have sale pricing.
                            </div>
                            <CheckRow
                              name="showOnSaleCollection"
                              defaultChecked={
                                seller.showOnSaleCollection
                              }
                              label="Show On Sale on my store"
                            />
                          </div>

                          <div className="hg-system-collection">
                            <div className="hg-system-collection-title">
                              Featured Products — You Choose
                            </div>
                            <div className="hg-system-collection-text">
                              Select up to 5 Active products in the Featured Products section below.
                            </div>
                            <CheckRow
                              name="showFeaturedCollection"
                              defaultChecked={
                                seller.showFeaturedCollection
                              }
                              label="Show Featured Products on my store"
                            />
                          </div>

                          <div className="hg-system-collection">
                            <div className="hg-system-collection-title">
                              Custom Collections — You Build
                            </div>
                            <div className="hg-system-collection-text">
                              Create groups such as Burmese Curly, Glueless Wigs, Raw Hair, or Under $200, then check the products that belong in each one.
                            </div>
                            <CheckRow
                              name="showCustomCollections"
                              defaultChecked={
                                seller.showCustomCollections
                              }
                              label="Show Custom Collections on my store"
                            />
                          </div>

                          <CheckRow
                            name="showGallery"
                            defaultChecked={seller.showGallery}
                            label="Show Gallery & Video"
                          />

                          <CheckRow
                            name="showReviews"
                            defaultChecked={seller.showReviews}
                            label="Show Reviews"
                          />
                        </Card>

            <button
              type="submit"
              className="hg-button"
              style={{
                marginTop: "12px",
                width: "100%",
              }}
            >
              Save Storefront Sections
            </button>

            <IntentSaveStatus
              intent="saveStoreSections"
              matches={
                lastSubmittedIntent
              }
              actionData={
                actionData
              }
            />
          </Form>

          <Card
                      title="Featured Products"
                      subtitle="Choose up to 5 Active products shoppers should see first."
                    >
                      <Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="saveFeaturedProducts"
                        />

                        <FeaturedProductPicker
                          products={products}
                          selectedIds={featuredProductIds}
                        />

                        <button
                          type="submit"
                          className="hg-button"
                          style={{
                            marginTop: "12px",
                            width: "100%",
                          }}
                        >
                          Save Featured Products
                        </button>

                        <IntentSaveStatus
                          intent="saveFeaturedProducts"
                          matches={
                            lastSubmittedIntent
                          }
                          actionData={
                            actionData
                          }
                        />
                      </Form>
                    </Card>

          <Card
                      title="Custom Collections"
                      subtitle="These are optional groups you create yourself. Name it, choose an optional image, check the products that belong in it, then save."
                    >
                      <InfoBox>
                        Shop All, New Arrivals, and On Sale are automatic — you do not build those here. Use Custom Collections only when you want your own shopper-facing group, such as “Burmese Curly.”
                      </InfoBox>

                      <Form
                        method="post"
                        encType="multipart/form-data"
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="createCollection"
                        />

                        <Field
                          label="Collection Name"
                          name="collectionName"
                          defaultValue=""
                          help="Give shoppers a short, clear collection name."
                        />

                        <div
                          style={{
                            marginTop: "12px",
                          }}
                        >
                          <div className="hg-label">
                            Collection Image (Optional)
                          </div>
                          <input
                            type="file"
                            name="collectionImage"
                            accept="image/*"
                            style={{
                              width: "100%",
                              fontSize: "11px",
                            }}
                          />
                        </div>

                        <ProductPicker
                          products={products}
                          selectedIds={[]}
                        />

                        <button
                          type="submit"
                          className="hg-button"
                          style={{
                            marginTop: "12px",
                          }}
                        >
                          Add Collection
                        </button>

                        <IntentSaveStatus
                          intent="createCollection"
                          matches={
                            lastSubmittedIntent
                          }
                          actionData={
                            actionData
                          }
                        />
                      </Form>

                      {collections.length === 0 ? (
                        <InfoBox>
                          No Custom Collections yet. That is completely fine — Shop All, New Arrivals, and On Sale are handled automatically by HairGrab.
                        </InfoBox>
                      ) : (
                        collections.map(
                          (collection) => (
                            <Form
                              method="post"
                              encType="multipart/form-data"
                              key={collection.id}
                              className="hg-collection"
                            >
                              <input
                                type="hidden"
                                name="collectionId"
                                value={collection.id}
                              />

                              {collection.imageUrl && (
                                <img
                                  src={
                                    collection.imageUrl
                                  }
                                  alt={
                                    collection.name
                                  }
                                  style={{
                                    width: "100%",
                                    height: "110px",
                                    objectFit: "cover",
                                    borderRadius:
                                      "9px",
                                    marginBottom:
                                      "10px",
                                  }}
                                />
                              )}

                              <Field
                                label="Collection Name"
                                name="collectionName"
                                defaultValue={
                                  collection.name
                                }
                              />

                              <label className="hg-check">
                                <input
                                  type="checkbox"
                                  name="collectionVisible"
                                  defaultChecked={
                                    collection.isVisible
                                  }
                                />
                                Show this collection
                              </label>

                              <div
                                style={{
                                  marginTop: "10px",
                                }}
                              >
                                <div className="hg-label">
                                  Collection Image (Optional)
                                </div>
                                <input
                                  type="file"
                                  name="collectionImage"
                                  accept="image/*"
                                  style={{
                                    width: "100%",
                                    fontSize: "11px",
                                  }}
                                />
                              </div>

                              <ProductPicker
                                products={products}
                                selectedIds={
                                  collection.productIds
                                }
                              />

                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                  marginTop: "12px",
                                }}
                              >
                                <button
                                  type="submit"
                                  name="intent"
                                  value="updateCollection"
                                  className="hg-button"
                                >
                                  Save Collection
                                </button>

                                <button
                                  type="submit"
                                  name="intent"
                                  value="deleteCollection"
                                  className="hg-button hg-button-danger"
                                  onClick={(event) => {
                                    if (
                                      !window.confirm(
                                        `Remove "${collection.name}"? This does not delete the products.`,
                                      )
                                    ) {
                                      event.preventDefault();
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              </div>

                              <IntentSaveStatus
                                intent="updateCollection"
                                matches={
                                  lastSubmittedIntent
                                }
                                actionData={
                                  actionData
                                }
                              />
                            </Form>
                          ),
                        )
                      )}
                    </Card>
        </div>

        <div className="hg-section-heading" style={{ marginTop: "24px" }}>
          <h2>4. Store Content</h2>
          <p>
            Add optional media and understand how HairGrab reviews appear on your storefront.
          </p>
        </div>

        <div
          className="hg-grid"
          style={{ marginTop: "12px" }}
        >
          <Card
                      title="Gallery & Video"
                      subtitle="Add brand, lifestyle, and product media to make your HairGrab store feel like your own site."
                    >
                      <Form
                        method="post"
                        encType="multipart/form-data"
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="addGalleryImage"
                        />

                        <div className="hg-label">
                          Add Gallery Image
                        </div>
                        <input
                          type="file"
                          name="galleryImage"
                          accept="image/*"
                          style={{
                            width: "100%",
                            fontSize: "11px",
                          }}
                        />

                        <button
                          type="submit"
                          className="hg-button"
                          style={{
                            marginTop: "10px",
                          }}
                        >
                          Upload Image
                        </button>
                      </Form>

                      <Form
                        method="post"
                        encType="multipart/form-data"
                        style={{
                          marginTop: "18px",
                          paddingTop: "16px",
                          borderTop:
                            "1px solid #eee7f2",
                        }}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="addVideo"
                        />

                        <div className="hg-label">
                          Upload Brand / Product Video
                        </div>
                        <input
                          type="file"
                          name="videoFile"
                          accept="video/*"
                          style={{
                            width: "100%",
                            fontSize: "11px",
                          }}
                        />
                        <div
                          style={{
                            color: "#8a7b91",
                            fontSize: "10px",
                            lineHeight: 1.45,
                            marginTop: "5px",
                          }}
                        >
                          Upload the video directly. Sellers do not need to paste a video URL.
                        </div>

                        <button
                          type="submit"
                          className="hg-button"
                          style={{
                            marginTop: "10px",
                          }}
                        >
                          Upload Video
                        </button>
                      </Form>

                      {media.length === 0 ? (
                        <InfoBox>
                          No gallery media yet.
                        </InfoBox>
                      ) : (
                        <div className="hg-media-grid">
                          {media.map((item) => (
                            <div
                              className="hg-media-item"
                              key={item.id}
                            >
                              {item.mediaType ===
                              "IMAGE" ? (
                                <img
                                  src={item.url}
                                  alt={
                                    item.altText ||
                                    "Store gallery"
                                  }
                                />
                              ) : (
                                <div
                                  style={{
                                    height: "130px",
                                    display: "flex",
                                    alignItems:
                                      "center",
                                    justifyContent:
                                      "center",
                                    textAlign:
                                      "center",
                                    padding: "12px",
                                    color: "#4B1678",
                                    fontWeight: 900,
                                    fontSize: "12px",
                                  }}
                                >
                                  ▶ Storefront Video
                                </div>
                              )}

                              <div className="hg-media-actions">
                                <Form method="post">
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="toggleMedia"
                                  />
                                  <input
                                    type="hidden"
                                    name="mediaId"
                                    value={item.id}
                                  />
                                  <button
                                    type="submit"
                                    className="hg-mini-button"
                                  >
                                    {item.isVisible
                                      ? "Hide"
                                      : "Show"}
                                  </button>
                                </Form>

                                <Form method="post">
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="deleteMedia"
                                  />
                                  <input
                                    type="hidden"
                                    name="mediaId"
                                    value={item.id}
                                  />
                                  <button
                                    type="submit"
                                    className="hg-mini-button"
                                  >
                                    Remove
                                  </button>
                                </Form>

                                <span
                                  style={{
                                    fontSize: "9px",
                                    color:
                                      item.isVisible
                                        ? "#28743b"
                                        : "#8a7b91",
                                    fontWeight: 800,
                                    alignSelf:
                                      "center",
                                  }}
                                >
                                  {item.isVisible
                                    ? "VISIBLE"
                                    : "HIDDEN"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <InfoBox>
                        HairGrab keeps shoppers on HairGrab.
                        Seller websites, Instagram, TikTok,
                        and other off-site shopping links are
                        not part of the storefront.
                      </InfoBox>
                    </Card>

          <Card
                      title="Reviews"
                      subtitle="HairGrab controls review authenticity; sellers control only whether the review section is displayed."
                    >
                      <ReviewRule
                        title="Product Reviews"
                        text='Products with no HairGrab reviews display "New on HairGrab" instead of empty stars.'
                      />
                      <ReviewRule
                        title="Seller Reviews"
                        text="Your store reputation stays separate from individual product ratings."
                      />
                      <ReviewRule
                        title="Verified Purchase"
                        text="Verified Purchase is controlled by HairGrab order data, not by sellers."
                      />
                    </Card>
        </div>

      </main>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hg-card">
      <h2>{title}</h2>
      <div className="hg-subtitle">
        {subtitle}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  multiline,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  multiline?: boolean;
  help?: string;
}) {
  return (
    <label
      style={{
        display: "block",
        marginTop: "13px",
      }}
    >
      <div className="hg-label">
        {label}
      </div>

      {multiline ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          rows={5}
          maxLength={600}
          className="hg-field"
          style={{ resize: "vertical" }}
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          className="hg-field"
        />
      )}

      {help && (
        <div
          style={{
            color: "#817686",
            fontSize: "10px",
            lineHeight: 1.45,
            marginTop: "5px",
          }}
        >
          {help}
        </div>
      )}
    </label>
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
  const [
    selectedPreviewUrl,
    setSelectedPreviewUrl,
  ] = useState<string>("");

  useEffect(() => {
    return () => {
      if (
        selectedPreviewUrl.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          selectedPreviewUrl,
        );
      }
    };
  }, [selectedPreviewUrl]);

  const previewUrl =
    selectedPreviewUrl ||
    currentUrl;

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      setSelectedPreviewUrl("");
      return;
    }

    if (
      selectedPreviewUrl.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        selectedPreviewUrl,
      );
    }

    setSelectedPreviewUrl(
      URL.createObjectURL(file),
    );
  };

  return (
    <div>
      <div className="hg-label">
        {label}
      </div>

      <div
        className={`hg-image-box${
          banner ? " banner" : ""
        }`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            style={{
              objectPosition:
                "center",
              display:
                "block",
            }}
          />
        ) : (
          <div
            style={{
              color: "#8a7b91",
              fontSize: "11px",
              textAlign: "center",
              padding: "20px",
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
        onChange={handleImageChange}
        style={{
          width: "100%",
          fontSize: "11px",
        }}
      />

      {selectedPreviewUrl && (
        <div
          style={{
            color: "#4B1678",
            fontSize: "10px",
            fontWeight: 800,
            marginTop: "6px",
          }}
        >
          New image selected — preview shown above. Click Save Store Basics to publish it.
        </div>
      )}

      <div
        style={{
          color: "#8a7b91",
          fontSize: "10px",
          lineHeight: 1.45,
          marginTop: "5px",
        }}
      >
        {help}
      </div>
    </div>
  );
}

function CheckRow({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
}) {
  return (
    <label className="hg-check">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
      />
      <span>{label}</span>
    </label>
  );
}

function FeaturedProductPicker({
  products,
  selectedIds,
}: {
  products: Array<{
    id: string;
    title: string;
    shopifyHandle: string | null;
  }>;
  selectedIds: string[];
}) {
  const selected = new Set(selectedIds);

  return (
    <div>
      {products.length === 0 ? (
        <InfoBox>
          Add at least one Active product before choosing Featured Products.
        </InfoBox>
      ) : (
        <>
          <div className="hg-products">
            {products.map((product) => (
              <label
                className="hg-product-check"
                key={product.id}
              >
                <input
                  type="checkbox"
                  name="featuredProductIds"
                  value={product.id}
                  defaultChecked={selected.has(
                    product.id,
                  )}
                  style={{
                    accentColor: "#4B1678",
                  }}
                />
                <span>{product.title}</span>
              </label>
            ))}
          </div>

          <div
            style={{
              color: "#817686",
              fontSize: "9px",
              marginTop: "6px",
              lineHeight: 1.45,
            }}
          >
            Choose up to 5. If more than 5 are checked, HairGrab saves the first 5.
          </div>
        </>
      )}
    </div>
  );
}

function ProductPicker({
  products,
  selectedIds,
}: {
  products: Array<{
    id: string;
    title: string;
    shopifyHandle: string | null;
  }>;
  selectedIds: string[];
}) {
  const selected =
    new Set(selectedIds);

  return (
    <div style={{ marginTop: "12px" }}>
      <div className="hg-label">
        Products
      </div>

      {products.length === 0 ? (
        <div className="hg-info">
          You do not have any Active products to select yet.
        </div>
      ) : (
        <div className="hg-products">
          {products.map((product) => (
            <label
              className="hg-product-check"
              key={product.id}
            >
              <input
                type="checkbox"
                name="collectionProductIds"
                value={product.id}
                defaultChecked={selected.has(
                  product.id,
                )}
                style={{
                  accentColor: "#4B1678",
                }}
              />
              <span>{product.title}</span>
            </label>
          ))}
        </div>
      )}

      <div
        style={{
          color: "#817686",
          fontSize: "9px",
          marginTop: "5px",
        }}
      >
        Tap each Active product that belongs in this Custom Collection.
      </div>
    </div>
  );
}

function ReviewRule({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom:
          "1px solid #f0e9f3",
      }}
    >
      <div
        style={{
          color: "#35263e",
          fontSize: "12px",
          fontWeight: 900,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#817686",
          fontSize: "10px",
          lineHeight: 1.45,
          marginTop: "4px",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function InfoBox({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="hg-info">
      {children}
    </div>
  );
}

function MiniStat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border:
          "1px solid #e5dce9",
        borderRadius: "12px",
        padding: "13px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#4B1678",
          fontSize: "17px",
          fontWeight: 900,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: "#756b79",
          fontSize: "9px",
          marginTop: "4px",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Notice({
  success,
  text,
}: {
  success: boolean;
  text: string;
}) {
  return (
    <div
      style={{
        background: success
          ? "#edf8ef"
          : "#fff0f0",
        color: success
          ? "#28743b"
          : "#9b2c2c",
        border: success
          ? "1px solid #cdebd2"
          : "1px solid #f3caca",
        borderRadius: "10px",
        padding: "11px 13px",
        fontSize: "11px",
        fontWeight: 800,
        marginTop: "16px",
      }}
    >
      {text}
    </div>
  );
}

// Scoped confirmation for one "3. Build Your Storefront" form.
// Shows "Saving…" while THIS intent is in flight, then the actual
// server result once it lands — right next to the button the
// seller just clicked, instead of only in the page-top Notice.
function IntentSaveStatus({
  intent,
  matches,
  actionData,
}: {
  intent: string;
  matches: string | null;
  actionData:
    | { success: boolean; message: string }
    | undefined;
}) {
  if (matches !== intent) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "10px",
      }}
    >
      {actionData ? (
        <Notice
          success={
            actionData.success
          }
          text={
            actionData.message
          }
        />
      ) : (
        <div
          style={{
            color: "#7d7480",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}
