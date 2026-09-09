type ShopifyAdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ShippingMethod = "Free Shipping" | "Flat Rate Shipping";

type SyncShippingProfileArgs = {
  admin: ShopifyAdminClient;
  locationId: string;
  variantIds: string[];
  shippingMethod: ShippingMethod;
  flatRateShipping?: string | number | null;
};

function formatGraphQLErrors(errors: any[] | undefined) {
  return (errors || [])
    .map((error) => error?.message || "Unknown Shopify error.")
    .join(" | ");
}

function shippingProfileDetails(
  shippingMethod: ShippingMethod,
  flatRateShipping?: string | number | null,
) {
  if (shippingMethod === "Free Shipping") {
    return {
      amount: 0,
      profileName: "HairGrab Free Shipping",
      methodName: "Free Shipping",
    };
  }

  const amount = Number(flatRateShipping);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "HairGrab could not create the Shopify shipping profile because the flat-rate amount is invalid.",
    );
  }

  const fixedAmount = Number(amount.toFixed(2));

  return {
    amount: fixedAmount,
    profileName: `HairGrab Flat Rate $${fixedAmount.toFixed(2)}`,
    methodName: "Standard Shipping",
  };
}

async function findProfileByName(
  admin: ShopifyAdminClient,
  profileName: string,
) {
  const response = await admin.graphql(`#graphql
    query HairGrabDeliveryProfiles {
      deliveryProfiles(first: 100) {
        nodes {
          id
          name
          default
        }
      }
    }
  `);

  const json = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      `Shopify could not read shipping profiles: ${formatGraphQLErrors(json.errors)}`,
    );
  }

  return (json?.data?.deliveryProfiles?.nodes || []).find(
    (profile: { id: string; name: string }) =>
      profile.name === profileName,
  ) as { id: string; name: string } | undefined;
}

async function associateVariantsToProfile(
  admin: ShopifyAdminClient,
  profileId: string,
  variantIds: string[],
) {
  const response = await admin.graphql(
    `#graphql
    mutation HairGrabAssignShippingProfile(
      $id: ID!
      $profile: DeliveryProfileInput!
    ) {
      deliveryProfileUpdate(
        id: $id
        profile: $profile
      ) {
        profile {
          id
          name
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
        id: profileId,
        profile: {
          variantsToAssociate: variantIds,
        },
      },
    },
  );

  const json = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      `Shopify could not assign the shipping profile: ${formatGraphQLErrors(json.errors)}`,
    );
  }

  const errors = json?.data?.deliveryProfileUpdate?.userErrors || [];

  if (errors.length) {
    throw new Error(
      `Shopify could not assign the shipping profile: ${formatGraphQLErrors(errors)}`,
    );
  }
}

async function createProfile(
  admin: ShopifyAdminClient,
  locationId: string,
  variantIds: string[],
  profileName: string,
  methodName: string,
  amount: number,
) {
  const response = await admin.graphql(
    `#graphql
    mutation HairGrabCreateShippingProfile(
      $profile: DeliveryProfileInput!
    ) {
      deliveryProfileCreate(profile: $profile) {
        profile {
          id
          name
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
        profile: {
          name: profileName,
          variantsToAssociate: variantIds,
          locationGroupsToCreate: [
            {
              locationsToAdd: [locationId],
              zonesToCreate: [
                {
                  name: "United States",
                  countries: [
                    {
                      code: "US",
                    },
                  ],
                  methodDefinitionsToCreate: [
                    {
                      name: methodName,
                      rateDefinition: {
                        price: {
                          amount,
                          currencyCode: "USD",
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  );

  const json = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      `Shopify could not create the shipping profile: ${formatGraphQLErrors(json.errors)}`,
    );
  }

  const result = json?.data?.deliveryProfileCreate;
  const errors = result?.userErrors || [];

  if (errors.length) {
    throw new Error(
      `Shopify could not create the shipping profile: ${formatGraphQLErrors(errors)}`,
    );
  }

  if (!result?.profile?.id) {
    throw new Error(
      "Shopify did not return the new HairGrab shipping profile.",
    );
  }

  return String(result.profile.id);
}

export async function syncHairGrabShippingProfile({
  admin,
  locationId,
  variantIds,
  shippingMethod,
  flatRateShipping,
}: SyncShippingProfileArgs) {
  const cleanVariantIds = [...new Set(variantIds.filter(Boolean))];

  if (!cleanVariantIds.length) {
    throw new Error(
      "HairGrab could not assign checkout shipping because Shopify returned no product variants.",
    );
  }

  const { amount, profileName, methodName } = shippingProfileDetails(
    shippingMethod,
    flatRateShipping,
  );

  const existingProfile = await findProfileByName(admin, profileName);

  if (existingProfile?.id) {
    await associateVariantsToProfile(
      admin,
      String(existingProfile.id),
      cleanVariantIds,
    );

    return {
      profileId: String(existingProfile.id),
      profileName,
      amount,
      created: false,
    };
  }

  const profileId = await createProfile(
    admin,
    locationId,
    cleanVariantIds,
    profileName,
    methodName,
    amount,
  );

  return {
    profileId,
    profileName,
    amount,
    created: true,
  };
}
