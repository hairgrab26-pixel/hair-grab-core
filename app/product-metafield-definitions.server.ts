// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import {
  REQUIRED_CUSTOM_PRODUCT_METAFIELDS,
  definitionMatchesRequired,
  requiredCustomMetafieldType,
} from "../lib/shopify/required-product-metafields.ts";

const LIST_DEFINITIONS = `#graphql
query HairGrabRequiredProductMetafieldDefinitions {
  metafieldDefinitions(ownerType: PRODUCT, first: 250) {
    nodes {
      id
      name
      namespace
      key
      type { name }
      validations { name type value }
      constraints { key }
      access { storefront }
    }
  }
}
`;

const CREATE_DEFINITION = `#graphql
mutation HairGrabCreateProductMetafieldDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id namespace key type { name } }
    userErrors { field message code }
  }
}
`;

const UPDATE_ACCESS = `#graphql
mutation HairGrabUpdateProductMetafieldDefinitionAccess($definition: MetafieldDefinitionUpdateInput!) {
  metafieldDefinitionUpdate(definition: $definition) {
    updatedDefinition { id access { storefront } }
    userErrors { field message code }
  }
}
`;

const DELETE_DEFINITION = `#graphql
mutation HairGrabDeleteProductMetafieldDefinition($id: ID!, $deleteAllAssociatedMetafields: Boolean!) {
  metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: $deleteAllAssociatedMetafields) {
    deletedDefinitionId
    userErrors { field message code }
  }
}
`;

type AdminClient = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<any> }> };

function formatErrors(errors: Array<{ message?: string }> | undefined) {
  return (errors || []).map((error) => error.message).filter(Boolean).join(" | ");
}

async function graphqlJson(admin: AdminClient, query: string, variables?: Record<string, unknown>) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return response.json();
}

/** Create unconstrained custom origin/lace/density/cap_type/ships_within PRODUCT definitions if missing, and enable storefront read. */
export async function ensureRequiredCustomProductMetafieldDefinitions(
  admin: AdminClient,
  { recreateMismatchedTypes = false }: { recreateMismatchedTypes?: boolean } = {},
) {
  const listed = await graphqlJson(admin, LIST_DEFINITIONS);
  if (listed?.errors?.length) {
    throw new Error(formatErrors(listed.errors) || "Unable to read Shopify metafield definitions.");
  }
  const nodes: any[] = listed?.data?.metafieldDefinitions?.nodes || [];

  for (const spec of REQUIRED_CUSTOM_PRODUCT_METAFIELDS) {
    let existing = nodes.find((node) => definitionMatchesRequired(node, spec));
    if (
      recreateMismatchedTypes &&
      existing?.id &&
      String(existing.type?.name || "") &&
      String(existing.type?.name || "") !== spec.type
    ) {
      const deleted = await graphqlJson(admin, DELETE_DEFINITION, {
        id: existing.id,
        deleteAllAssociatedMetafields: true,
      });
      const userErrors = deleted?.data?.metafieldDefinitionDelete?.userErrors || [];
      if (deleted?.errors?.length || userErrors.length) {
        console.warn(
          `[HairGrab Core] Could not recreate custom.${spec.key} as ${spec.type}:`,
          formatErrors([...(deleted?.errors || []), ...userErrors]) || "unknown error",
        );
      } else {
        const index = nodes.indexOf(existing);
        if (index >= 0) nodes.splice(index, 1);
        existing = undefined;
      }
    }
    if (!existing) {
      const created = await graphqlJson(admin, CREATE_DEFINITION, {
        definition: {
          name: spec.name,
          namespace: "custom",
          key: spec.key,
          description: spec.description,
          type: spec.type,
          ownerType: "PRODUCT",
          pin: true,
          access: { storefront: "PUBLIC_READ" },
        },
      });
      const userErrors = created?.data?.metafieldDefinitionCreate?.userErrors || [];
      const createdDefinition = created?.data?.metafieldDefinitionCreate?.createdDefinition;
      if (created?.errors?.length || userErrors.length) {
        console.warn(
          `[HairGrab Core] Could not create custom.${spec.key} metafield definition:`,
          formatErrors([...(created?.errors || []), ...userErrors]) || "unknown error",
        );
      } else if (createdDefinition) {
        existing = createdDefinition;
        nodes.push(createdDefinition);
      }
    }

    if (existing?.id && String(existing.access?.storefront || "").toUpperCase() !== "PUBLIC_READ") {
      const updated = await graphqlJson(admin, UPDATE_ACCESS, {
        definition: {
          id: existing.id,
          access: { storefront: "PUBLIC_READ" },
        },
      });
      const userErrors = updated?.data?.metafieldDefinitionUpdate?.userErrors || [];
      if (updated?.errors?.length || userErrors.length) {
        console.warn(
          `[HairGrab Core] Could not enable storefront access for custom.${spec.key}:`,
          formatErrors([...(updated?.errors || []), ...userErrors]) || "unknown error",
        );
      }
    }
  }

  const refreshed = await graphqlJson(admin, LIST_DEFINITIONS);
  return (refreshed?.data?.metafieldDefinitions?.nodes || nodes) as Array<{
    id?: string;
    namespace: string;
    key: string;
    type?: { name: string };
    constraints?: { key?: string | null } | null;
  }>;
}

export function customMetafieldType(
  definitions: Array<{ namespace?: string; key?: string; type?: { name: string }; constraints?: { key?: string | null } | null }>,
  key: string,
  fallback: string,
) {
  const required = requiredCustomMetafieldType(key, fallback);
  const match = definitions.find((definition) => definitionMatchesRequired(definition, { key }));
  const live = match?.type?.name;
  if (live && live !== required) return live;
  return required;
}
