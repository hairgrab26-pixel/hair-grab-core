import { useActionData, useFetcher } from "react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from "react";
import { displayProductCategory, normalizeProductCategory, PRODUCT_CATEGORY_LABELS } from "../product-categories";
import { diffMedia, diffVariants, hydrateMediaEditState, hydrateVariantEditState, variantFieldsFromShopify, variantFieldsToShopify, type ExistingProductSnapshot } from "../product-builder-model";
import { materials, colors, DEFAULT_HAIR_COLOR, textures, standardLengths, densities, laceSizes, laceTypes, bundleWeights, hairOrigins, weftTypes, normalizeHairColor, normalizeHairColors, normalizeLaceSize, normalizeLaceType } from "../product-vocabulary";
import { parseCsvText, normalizeCsvHeader, resolveCsvProductFields, resolveStructuredProductOption, inferProductDetailsFromTitle, STRUCTURED_COLUMN_ALIASES, type CsvFieldName } from "../csv-product-import";
import { weftOptionValues, parseCapTypeValues, parseDensityValues, parseLaceSizeValues, parseLaceTypeValues, parseShipsWithinValues } from "../product-attribute-tags";
import { CAP_SIZE_VALUES, CAP_TYPE_VALUES, categoryMaterialLabel, categoryShowsAttribute } from "../product-attribute-schema";
import type { action as addAction } from "../routes/seller.add-product";

type ProductType =
  | "WIG"
  | "BUNDLE"
  | "CLOSURE_FRONTAL"
  | "EXTENSION"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIAL";

type Choice = {
  value: string;
  label: string;
};

type VariantRow = {
  key: string;
  label: string;
  length: string;
  option: string;
  color: string;
  shopifyOptions?: Array<{ name: string; value: string }>;
};

type VariantData = {
  price: string;
  salePrice: string;
  inventory: string;
  sku: string;
};

function withNormalizedColorOptions(options: Array<{ name: string; value: string }> | undefined) {
  return (options || []).map((option) =>
    /^colou?r$/i.test(option.name)
      ? { ...option, value: normalizeHairColor(option.value) || option.value }
      : option,
  );
}

type ProductPayload = {
  title: string;
  description: string;

  productType: ProductType;

  material: string;
  colors: string[];
  texture: string;

  selectedOptions: string[];
  optionsAreVariants: boolean;
  searchClassifications: string[];
  installationMethods: string[];
  locType: string;

  density: string | string[];
  laceSize: string | string[];
  laceType: string | string[];
  capSize: string;
  capType: string | string[];
  origin: string;
  weftType: string;
  shipsFromCity: string;
  shipsFromState: string;
  shippingTerritory: string;
  bundleWeight: string;
  pieceCount: string;

  shippingMethod: string;
  flatRateShipping: string;
  localPickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  sameDayDelivery: boolean;
  shipsWithin: string | string[];
  returnPolicy: string;
  showOnMap: string;

  imageUrls?: string[];
  sourceOptionNames?: string[];
  csvSourceKey?: string;

  variants: Array<{
    label: string;
    length: string;
    option: string;
    color: string;
    price: string;
    salePrice?: string;
    inventory: string;
    sku: string;
    sourceOptionValues?: string[];
  }>;
};



export type SellerForBuilder = { businessName: string; sellsNationwide: boolean; offersLocalPickup: boolean; offersLocalDelivery: boolean; storeSlug?: string | null; storefrontPublished?: boolean; city?: string | null; state?: string | null };
// ==========================================================
// PRODUCT CONFIG
// ==========================================================

const productTypes:
  Array<{
    value:
      ProductType;
    label:
      string;
    description:
      string;
  }> = [
  {
    value:
      "WIG",
    label:
      "Wig",
    description:
      "Glueless, lace, closure, frontal and other wigs.",
  },

  {
    value:
      "BUNDLE",
    label:
      "Bundles",
    description:
      "Single bundles, bundle deals and wefted hair.",
  },

  {
    value:
      "CLOSURE_FRONTAL",
    label:
      "Closure / Frontal",
    description:
      "Closures, frontals and 360 lace pieces.",
  },

  {
    value:
      "EXTENSION",
    label:
      "Extensions",
    description:
      "Clip-ins, tape-ins, I-tips, ponytails and halos.",
  },

  {
    value:
      "BRAIDING_HAIR",
    label:
      "Braiding Hair",
    description:
      "Human or synthetic braiding and protective-style hair.",
  },

  {
    value:
      "HAIR_ESSENTIAL",
    label:
      "Hair Essentials",
    description:
      "Hair care, tools and accessories.",
  },
];

export const productOptions:
  Record<
    ProductType,
    Choice[]
  > = {
  WIG: [],

  BUNDLE: [
    {
      value:
        "SINGLE_BUNDLE",
      label:
        "Single Bundle",
    },

    {
      value:
        "BUNDLE_DEAL",
      label:
        "Bundle Deal",
    },

    {
      value:
        "WEFT",
      label:
        "Weft",
    },

    {
      value:
        "NO_WEFT",
      label:
        "No Weft",
    },

    {
      value:
        "WITH_CLOSURE",
      label:
        "Includes Closure",
    },

    {
      value:
        "WITH_FRONTAL",
      label:
        "Includes Frontal",
    },
  ],

  CLOSURE_FRONTAL: [
    {
      value:
        "CLOSURE",
      label:
        "Closure",
    },

    {
      value:
        "FRONTAL",
      label:
        "Frontal",
    },

    {
      value:
        "360_FRONTAL",
      label:
        "360 Frontal",
    },
  ],

  EXTENSION: [
    {
      value:
        "CLIP_IN",
      label:
        "Clip-Ins",
    },

    {
      value:
        "TAPE_IN",
      label:
        "Tape-Ins",
    },

    {
      value:
        "I_TIP",
      label:
        "I-Tips / Microlinks",
    },

    {
      value:
        "PONYTAIL",
      label:
        "Ponytail",
    },

    {
      value:
        "HALO",
      label:
        "Halo",
    },

    {
      value:
        "TOPPER",
      label:
        "Topper",
    },

    {
      value:
        "SEW_IN",
      label:
        "Sew-In",
    },

    {
      value:
        "OTHER",
      label:
        "Other",
    },
  ],

  BRAIDING_HAIR: [
    {
      value:
        "PRE_STRETCHED",
      label:
        "Pre-Stretched",
    },

    {
      value:
        "BOHO",
      label:
        "Boho / Loose Curl",
    },
  ],

  HAIR_ESSENTIAL: [
    {
      value:
        "HAIR_CARE",
      label:
        "Hair Care",
    },

    {
      value:
        "WIG_CARE",
      label:
        "Wig Care",
    },

    {
      value:
        "INSTALLATION",
      label:
        "Installation",
    },

    {
      value:
        "STYLING",
      label:
        "Styling",
    },

    {
      value:
        "TOOLS",
      label:
        "Tools",
    },

    {
      value:
        "ACCESSORIES",
      label:
        "Accessories",
    },
  ],
};

export const productClassifications:
  Partial<
    Record<
      ProductType,
      Choice[]
    >
  > = {
  WIG: [
    {
      value:
        "KOSHER_WIG",
      label:
        "Kosher Wig",
    },

    {
      value:
        "MEDICAL_WIG",
      label:
        "Medical Wig",
    },
  ],

  BRAIDING_HAIR: [
    {
      value:
        "LOCS",
      label:
        "Locs",
    },

    {
      value:
        "CROCHET_HAIR",
      label:
        "Crochet Hair",
    },
  ],
};

export const installationMethodChoices: Choice[] = [
  {
    value:
      "CROCHET",
    label:
      "Crochet",
  },
  {
    value:
      "PRE_LOOPED",
    label:
      "Pre-Looped",
  },
];

export const locTypeChoices: Choice[] = [
  { value: "BUTTERFLY_LOCS", label: "Butterfly Locs" },
  { value: "FAUX_LOCS", label: "Faux Locs" },
  { value: "GODDESS_LOCS", label: "Goddess Locs" },
  { value: "SOFT_LOCS", label: "Soft Locs" },
  { value: "DISTRESSED_LOCS", label: "Distressed Locs" },
  { value: "BOHO_LOCS", label: "Boho Locs" },
  { value: "MARLEY_LOCS", label: "Marley Locs" },
  { value: "WAVY_CURLY_LOCS", label: "Wavy / Curly Locs" },
  { value: "TRADITIONAL_LOCS", label: "Traditional Locs" },
  { value: "OTHER_LOCS", label: "Other" },
];

export const shipsWithinChoices: Choice[] = [
  { value: "Same Day", label: "Same Day Delivery / Pickup" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "2-3 Days", label: "2-3 Days" },
  { value: "48 Hours", label: "48 Hours" },
  { value: "72 Hours", label: "72 Hours" },
  { value: "3-5 Days", label: "3-5 Days" },
];

const LEGACY_WIG_CAP_OPTIONS: Choice[] = [
  { value: "GLUELESS", label: "Glueless" },
  { value: "LACE", label: "Lace" },
  { value: "CLOSURE_WIG", label: "Closure Wig" },
  { value: "FRONTAL_WIG", label: "Frontal Wig" },
  { value: "FULL_LACE", label: "Full Lace" },
  { value: "HEADBAND", label: "Headband Wig" },
];


// materials, colors, textures, standardLengths, densities, laceSizes,
// and laceTypes moved to ../product-vocabulary in Phase 2A so the CSV
// importer and its tests can validate against the exact same
// controlled vocabulary as this form. Imported at the top of this
// file; content is unchanged, so rendered choices are unchanged.

// ==========================================================
// STYLES
// ==========================================================

const fieldStyle = {
  width:
    "100%",

  boxSizing:
    "border-box" as const,

  border:
    "1px solid #d8cce0",

  borderRadius:
    "10px",

  padding:
    "11px 12px",

  background:
    "#ffffff",

  color:
    "#21152a",

  fontSize:
    "14px",
};

const labelStyle = {
  display:
    "block",

  marginBottom:
    "6px",

  color:
    "#4B1678",

  fontSize:
    "13px",

  fontWeight:
    "800",
};

const sectionStyle = {
  marginTop:
    "25px",

  paddingTop:
    "23px",

  borderTop:
    "1px solid #eee7f2",
};

const headingStyle = {
  margin:
    "0 0 15px",

  color:
    "#4B1678",

  fontSize:
    "19px",
};

const thStyle = {
  textAlign:
    "left" as const,

  padding:
    "10px",

  color:
    "#4B1678",

  fontSize:
    "11px",
};

const tdStyle = {
  padding:
    "8px",

  color:
    "#35263e",

  fontSize:
    "12px",
};


// ==========================================================
// SMALL COMPONENTS
// ==========================================================

function toggleValue(
  current:
    string[],
  value:
    string,
) {
  return current.includes(
    value,
  )
    ? current.filter(
        (
          item,
        ) =>
          item !==
          value,
      )
    : [
        ...current,
        value,
      ];
}

function AttributeChipGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
        {values.map((item) => (
          <ChoiceButton
            key={item}
            label={item}
            selected={selected.includes(item)}
            onClick={() => onToggle(item)}
          />
        ))}
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label:
    string;
  selected:
    boolean;
  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      style={{
        border:
          selected
            ? "2px solid #4B1678"
            : "1px solid #d8cce0",

        background:
          selected
            ? "#f7f0fb"
            : "#ffffff",

        color:
          "#4B1678",

        borderRadius:
          "9px",

        padding:
          "9px 12px",

        fontWeight:
          "800",

        fontSize:
          "12px",

        cursor:
          "pointer",
      }}
    >
      {selected
        ? "✓ "
        : ""}
      {label}
    </button>
  );
}


// ==========================================================
// PAGE
// ==========================================================

export type EditBuilderData = {
  coreProductId: string;
  product: { title: string; descriptionHtml: string; productType: string; tags: string[]; handle?: string };
  settings: Record<string, any>;
  shopifySnapshot: ExistingProductSnapshot;
};

export default function ProductBuilder({ seller, edit }: { seller: SellerForBuilder; edit?: EditBuilderData }) {
  const initialVariantEdit = useMemo(() => edit ? hydrateVariantEditState(edit.shopifySnapshot) : null, [edit]);
  const initialMediaEdit = useMemo(() => edit ? hydrateMediaEditState(edit.shopifySnapshot) : null, [edit]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [mediaOrder, setMediaOrder] = useState<string[]>(initialMediaEdit?.order || []);
  const [newMedia, setNewMedia] = useState<Array<{ key: string; file: File; kind: "IMAGE" | "VIDEO" }>>([]);
  const newMediaPreviewUrls = useMemo(() => new Map(
    newMedia.map((item) => [item.key, URL.createObjectURL(item.file)]),
  ), [newMedia]);

  useEffect(() => () => {
    for (const url of newMediaPreviewUrls.values()) URL.revokeObjectURL(url);
  }, [newMediaPreviewUrls]);
  const [optionOverrides, setOptionOverrides] = useState<Record<string, Array<{ name: string; value: string }>>>({});
  const [manualCombinations, setManualCombinations] = useState<Array<{ key: string; options: Array<{ name: string; value: string }> }>>([]);
  const [newCombinationValues, setNewCombinationValues] = useState<Record<string, string>>({});
  const initialEditFields = useRef<Record<string, unknown> | null>(null);
  const initialBundleLengths = useRef<string[]>([]);

  useEffect(
    () => {
      if (
        !seller.offersLocalPickup
      ) {
        setLocalPickupAvailable(
          false,
        );
      }

      if (
        !seller.offersLocalDelivery
      ) {
        setLocalDeliveryAvailable(
          false,
        );
      }
    },
    [
      seller.offersLocalPickup,
      seller.offersLocalDelivery,
    ],
  );

  const actionData =
    useActionData<
      typeof addAction
    >();

  const saveFetcher =
    useFetcher<
      typeof addAction
    >();

  const csvImportFetcher =
    useFetcher<
      typeof addAction
    >();

  const saving =
    saveFetcher.state !==
    "idle";

  const [editDirty, setEditDirty] = useState(false);
  const [showEditSaved, setShowEditSaved] = useState(false);

  const saveResult =
    saveFetcher.data ||
    actionData;

  useEffect(() => {
    if (!edit || saving || !saveResult) return;
    if (saveResult.success && !editDirty) {
      setShowEditSaved(true);
      const timeout = window.setTimeout(() => setShowEditSaved(false), 4500);
      return () => window.clearTimeout(timeout);
    }
    if (saveResult.success === false) setEditDirty(true);
  }, [edit, saving, saveResult?.success, editDirty]);

  useEffect(
    () => {
      if (
        saveResult?.success &&
        saveResult?.draftSaved &&
        saveResult?.sellerProductId
      ) {
        window.location.href =
          `/seller/edit-product/${saveResult.sellerProductId}`;
      }
    },
    [
      saveResult?.success,
      saveResult?.draftSaved,
      saveResult?.sellerProductId,
    ],
  );

  // Final Save Product (non-draft) does not navigate away — it
  // re-renders the same Review Product screen with saveResult set.
  // The success confirmation banner lives near the top of that
  // screen, but the seller is typically scrolled down near the
  // Save Product button when the save completes, so without this
  // the confirmation is invisible unless they manually scroll up.
  // Bring it into view automatically instead.
  const successBannerRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(
    () => {
      if (
        saveResult?.success &&
        !saveResult?.draftSaved &&
        successBannerRef.current
      ) {
        successBannerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [
      saveResult?.success,
      saveResult?.draftSaved,
    ],
  );

  const [
    reviewing,
    setReviewing,
  ] =
    useState(
      false,
    );

  const [
    title,
    setTitle,
  ] =
    useState("");

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [aiWriting, setAiWriting] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  const [
    productType,
    setProductType,
  ] =
    useState<ProductType | null>(
      null,
    );

  const [
    selectedOptions,
    setSelectedOptions,
  ] =
    useState<string[]>(
      [],
    );

  const [
    optionsAreVariants,
    setOptionsAreVariants,
  ] =
    useState(
      false,
    );

  const [
    searchClassifications,
    setSearchClassifications,
  ] =
    useState<string[]>(
      [],
    );

  const [
    installationMethods,
    setInstallationMethods,
  ] =
    useState<string[]>(
      [],
    );

  const [
    locType,
    setLocType,
  ] =
    useState("");

  const [
    csvFileName,
    setCsvFileName,
  ] =
    useState("");

  type CsvImportedVariant = {
    key: string;
    price: string;
    inventory: string;
    sku: string;
    sourceOptionValues: string[];
  };

  type CsvImportedProduct = {
    key: string;
    title: string;
    description: string;
    rows: number;
    status: string;
    skuCount: number;
    variantCount: number;
    imageUrls: string[];
    sourceOptionNames: string[];
    variants: CsvImportedVariant[];
    productType?: ProductType;
    material?: string;
    texture?: string;
    productOption?: string;
    classification?: string;
    installationMethod?: string;
    locType?: string;
    laceSize?: string;
    density?: string;
    laceType?: string;
    capSize?: string;
    capType?: string;
    bundleWeight?: string;
    pieceCount?: string;
    excluded?: boolean;
    imported?: boolean;
    importError?: string;
    needsConfirmation?: CsvFieldName[];
    rowErrors?: string[];
  };

  const [
    csvPreview,
    setCsvPreview,
  ] = useState<{
    rows: number;
    products: number;
    recognized: string[];
    ready: number;
    needsDetails: number;
    items: CsvImportedProduct[];
  } | null>(null);

  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<string[]>([]);
  const [csvBulkProductType, setCsvBulkProductType] = useState<ProductType | "">("");
  const [csvBulkMaterial, setCsvBulkMaterial] = useState("");
  const [csvBulkTexture, setCsvBulkTexture] = useState("");
  const [csvEditingKey, setCsvEditingKey] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportProgress, setCsvImportProgress] = useState("");
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    failed: number;
    failures: string[];
  } | null>(null);

  // HairGrab keeps this dumb easy:
  // selecting 2+ product options automatically turns those
  // options into separate variants. No hidden checkbox needed.
  useEffect(
    () => {
      setOptionsAreVariants(
        productType === "BUNDLE" &&
        selectedOptions.includes(
          "BUNDLE_DEAL",
        )
          ? false
          : selectedOptions.length > 1,
      );
    },
    [
      productType,
      selectedOptions,
    ],
  );


  useEffect(() => {
    if (!searchClassifications.includes("LOCS")) {
      setLocType("");
    }
  }, [searchClassifications]);

  const [
    material,
    setMaterial,
  ] =
    useState("");

  const [
    customMaterial,
    setCustomMaterial,
  ] =
    useState("");

  const [
    color,
    setColor,
  ] =
    useState(
      DEFAULT_HAIR_COLOR,
    );

  const [
    customColor,
    setCustomColor,
  ] =
    useState("");

  const [
    selectedColors,
    setSelectedColors,
  ] =
    useState<string[]>(
      [
        DEFAULT_HAIR_COLOR,
      ],
    );

  const [
    texture,
    setTexture,
  ] =
    useState("");

  const [
    selectedLengths,
    setSelectedLengths,
  ] =
    useState<string[]>(
      [],
    );

  const [
    customLength,
    setCustomLength,
  ] =
    useState("");

  const [
    customLengths,
    setCustomLengths,
  ] =
    useState<string[]>(
      [],
    );

  const [
    selectedDensities,
    setSelectedDensities,
  ] =
    useState<string[]>(
      [],
    );

  const [
    selectedLaceSizes,
    setSelectedLaceSizes,
  ] =
    useState<string[]>(
      [],
    );

  const [
    selectedLaceTypes,
    setSelectedLaceTypes,
  ] =
    useState<string[]>(
      [],
    );

  const [
    capSize,
    setCapSize,
  ] =
    useState("");

  const [
    selectedCapTypes,
    setSelectedCapTypes,
  ] =
    useState<string[]>(
      [],
    );

  const [
    origin,
    setOrigin,
  ] =
    useState("");

  const [
    weftType,
    setWeftType,
  ] =
    useState("");

  const [
    shipsFromCity,
    setShipsFromCity,
  ] =
    useState(seller.city || "");

  const [
    shipsFromState,
    setShipsFromState,
  ] =
    useState(seller.state || "");

  const [
    shippingTerritory,
    setShippingTerritory,
  ] =
    useState(seller.sellsNationwide ? "Nationwide" : "Local");

  const [
    bundleWeight,
    setBundleWeight,
  ] =
    useState(
      "100g",
    );

  const [
    pieceCount,
    setPieceCount,
  ] =
    useState("");

  const [
    shippingMethod,
    setShippingMethod,
  ] =
    useState(
      "Free Shipping",
    );

  const [
    flatRateShipping,
    setFlatRateShipping,
  ] =
    useState("");

  const [
    localPickupAvailable,
    setLocalPickupAvailable,
  ] =
    useState(false);

  const [
    localDeliveryAvailable,
    setLocalDeliveryAvailable,
  ] =
    useState(false);

  const [
    sameDayDelivery,
    setSameDayDelivery,
  ] =
    useState(false);

  const [
    selectedShipsWithin,
    setSelectedShipsWithin,
  ] =
    useState<string[]>(
      ["48 Hours"],
    );

  const [
    returnPolicy,
    setReturnPolicy,
  ] =
    useState(
      "14-Day Returns",
    );

  const [
    showOnMap,
    setShowOnMap,
  ] =
    useState(
      "Yes",
    );

  const [
    startingPrice,
    setStartingPrice,
  ] =
    useState("");

  const [
    priceIncrease,
    setPriceIncrease,
  ] =
    useState("");

  const [
    quickPrice,
    setQuickPrice,
  ] =
    useState("");

  const [
    onSale,
    setOnSale,
  ] =
    useState(false);

  const [
    quickInventory,
    setQuickInventory,
  ] =
    useState("");

  const [
    variantValues,
    setVariantValues,
  ] =
    useState<
      Record<
        string,
        VariantData
      >
    >({});

  const [
    images,
    setImages,
  ] =
    useState<File[]>(
      [],
    );

  const [
    videos,
    setVideos,
  ] =
    useState<File[]>(
      [],
    );

  useEffect(() => {
    if (!edit) return;
    const category = normalizeProductCategory(edit.product.productType);
    const type = (Object.entries(PRODUCT_CATEGORY_LABELS).find(([, label]) => label === category)?.[0] || null) as ProductType | null;
    const settings = edit.settings;
    const existing = edit.shopifySnapshot.variants;
    const axisLengths = Array.from(new Set(existing.flatMap((variant) => variant.selectedOptions
      .filter((option) => option.name.toLowerCase() === "length")
      .map((option) => option.value.replace(/\D/g, ""))).filter(Boolean)));
    const bundleDealText = existing.flatMap((variant) => variant.selectedOptions.map((option) => option.value)).find((value) => /bundle deal/i.test(value)) || "";
    const lengths = axisLengths.length ? axisLengths : Array.from(bundleDealText.matchAll(/(\d+)\s*(?:inch|in|\")/gi), (match) => match[1]);
    initialBundleLengths.current = lengths;
    const initialOptions = [
      ...new Set([
        ...(productOptions[type || "WIG"] || []).filter((item) => edit.product.tags.includes(item.label)).map((item) => item.value),
        ...weftOptionValues(settings.weftType || settings.weft),
      ]),
    ];
    const initialClassifications = (productClassifications[type || "WIG"] || []).filter((item) => edit.product.tags.includes(item.label) ||
      (item.label === "Locs" && edit.product.tags.includes("Locs / Locks"))).map((item) => item.value);
    const initialInstallation = installationMethodChoices.filter((item) => edit.product.tags.includes(item.label)).map((item) => item.value);
    const initialLocType = locTypeChoices.find((item) => item.label === settings.locType)?.value || "";
    const initialDescription = edit.product.descriptionHtml.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "").trim();
    const knownMaterial = materials.find((item) => item.toLowerCase() === String(settings.material || "").toLowerCase());
    const knownTexture = textures.find((item) => item.toLowerCase() === String(settings.texture || "").toLowerCase());
    const knownDensities = parseDensityValues(settings.densities?.length ? settings.densities : settings.density);
    const knownLaceTypes = parseLaceTypeValues(settings.laceTypes || settings.laceType);
    const knownLaceSizes = parseLaceSizeValues(settings.laceSizes?.length ? settings.laceSizes : settings.laceSize);
    const capSizeChoices = [...CAP_SIZE_VALUES];
    const knownCapSize = capSizeChoices.find((item) => item.toLowerCase() === String(settings.capSize || "").toLowerCase());
    const knownCapTypes = parseCapTypeValues(settings.capTypes?.length ? settings.capTypes : settings.capType);
    const migratedCapTypes = LEGACY_WIG_CAP_OPTIONS
      .filter((item) => initialOptions.includes(item.value) || edit.product.tags.includes(item.label))
      .map((item) => item.label);
    const selectedCapTypeValues = [...new Set([...knownCapTypes, ...migratedCapTypes])];
    const selectedOptionValues = initialOptions.filter((value) => !LEGACY_WIG_CAP_OPTIONS.some((item) => item.value === value));
    const knownOrigin = hairOrigins.find((item) => item.toLowerCase() === String(settings.origin || "").toLowerCase());
    const knownWeftType = weftTypes.find((item) => item.toLowerCase() === String(settings.weftType || settings.weft || "").toLowerCase());
    const knownShipsWithin = parseShipsWithinValues(settings.shipsWithins?.length ? settings.shipsWithins : settings.shipsWithin);
    initialEditFields.current = { title: edit.product.title.trim(), description: initialDescription, productType: type,
      selectedOptions: selectedOptionValues, searchClassifications: initialClassifications,
      installationMethods: initialInstallation, locType: initialLocType,
      material: settings.material || "", colors: normalizeHairColors(settings.colors?.length ? settings.colors : [DEFAULT_HAIR_COLOR]),
      texture: knownTexture || settings.texture || "", density: knownDensities,
      laceSize: knownLaceSizes,
      laceType: knownLaceTypes, capSize: knownCapSize || settings.capSize || "",
      capType: selectedCapTypeValues,
      origin: knownOrigin || settings.origin || "",
      weftType: knownWeftType || settings.weftType || settings.weft || "",
      shipsFromCity: settings.shipsFromCity || seller.city || "",
      shipsFromState: settings.shipsFromState || seller.state || "",
      shippingTerritory: settings.shippingTerritory || (seller.sellsNationwide ? "Nationwide" : "Local"),
      lengths: lengths,
      bundleWeight: settings.bundleWeight || "100g", pieceCount: settings.pieceCount || "",
      shippingMethod: settings.builderShippingMethod || settings.shippingMethod || "Free Shipping", flatRateShipping: settings.flatRateShipping || "",
      localPickupAvailable: settings.localPickupAvailable ?? false, localDeliveryAvailable: settings.localDeliveryAvailable ?? false,
      sameDayDelivery: Boolean(settings.sameDayDelivery) || knownShipsWithin.some((item) => item.toLowerCase() === "same day"),
      shipsWithin: knownShipsWithin.length ? knownShipsWithin : (settings.shipsWithin ? [String(settings.shipsWithin)] : []),
      returnPolicy: settings.returnPolicy || "", showOnMap: settings.showOnMap || "" };
    setTitle(edit.product.title);
    setDescription(initialDescription);
    setProductType(type);
    setSelectedLengths(lengths);
    setCustomLengths(lengths.filter((length) => !standardLengths.includes(length)));
    setSelectedOptions(selectedOptionValues);
    setSearchClassifications(initialClassifications);
    setInstallationMethods(initialInstallation);
    setLocType(initialLocType);
    const hydratedColors = normalizeHairColors(Array.isArray(settings.colors) ? settings.colors : []);
    setMaterial(knownMaterial || (settings.material ? "Other" : ""));
    setCustomMaterial(knownMaterial ? "" : settings.material || "");
    setSelectedColors(hydratedColors.length ? hydratedColors : [DEFAULT_HAIR_COLOR]);
    if (hydratedColors[0]) setColor(colors.includes(hydratedColors[0]) ? hydratedColors[0] : "Other / Custom");
    if (hydratedColors[0] && !colors.includes(hydratedColors[0])) setCustomColor(hydratedColors[0]);
    setTexture(knownTexture || settings.texture || "");
    setSelectedDensities(knownDensities);
    setSelectedLaceSizes(knownLaceSizes);
    setSelectedLaceTypes(knownLaceTypes);
    setCapSize(knownCapSize || settings.capSize || "");
    setSelectedCapTypes(selectedCapTypeValues);
    setOrigin(knownOrigin || settings.origin || "");
    setWeftType(knownWeftType || settings.weftType || settings.weft || "");
    setShipsFromCity(settings.shipsFromCity || seller.city || "");
    setShipsFromState(settings.shipsFromState || seller.state || "");
    setShippingTerritory(settings.shippingTerritory || (seller.sellsNationwide ? "Nationwide" : "Local"));
    setBundleWeight(settings.bundleWeight || "100g");
    setPieceCount(settings.pieceCount || "");
    setShippingMethod(settings.builderShippingMethod || settings.shippingMethod || "Free Shipping");
    setFlatRateShipping(settings.flatRateShipping || "");
    setLocalPickupAvailable(settings.localPickupAvailable ?? false);
    setLocalDeliveryAvailable(settings.localDeliveryAvailable ?? false);
    setSameDayDelivery(Boolean(settings.sameDayDelivery) || knownShipsWithin.some((item) => item.toLowerCase() === "same day"));
    setSelectedShipsWithin(knownShipsWithin.length ? knownShipsWithin : ["48 Hours"]);
    setReturnPolicy(settings.returnPolicy || "");
    setShowOnMap(settings.showOnMap || "");
    setOnSale(existing.some((variant) => variant.compareAtPrice !== null));
    setVariantValues(Object.fromEntries(existing.map((variant) => [variant.id, variantFieldsFromShopify(variant)])));
    setMediaOrder(edit.shopifySnapshot.media.map((item) => item.id));
  }, [edit]);

  const isHair =
    productType !==
      null &&
    productType !==
      "HAIR_ESSENTIAL";

  const currentOptions =
    productType
      ? productOptions[
          productType
        ]
      : [];

  const currentClassifications =
    productType
      ? productClassifications[
          productType
        ] || []
      : [];

  const optionLabel =
    (
      value:
        string,
    ) =>
      currentOptions.find(
        (
          item,
        ) =>
          item.value ===
          value,
      )?.label ||
      value;

  const resolvedMaterial =
    material ===
    "Other"
      ? customMaterial.trim()
      : material;

  const resolvedColor =
    color ===
    "Other / Custom"
      ? customColor.trim()
      : color;

  const allLengths =
    useMemo(
      () => [
        ...standardLengths,
        ...customLengths,
      ],
      [
        customLengths,
      ],
    );

  const isBundleDeal =
    productType ===
      "BUNDLE" &&
    selectedOptions.includes(
      "BUNDLE_DEAL",
    );

  const variantRows =
    useMemo<
      VariantRow[]
    >(
      () => {
        if (edit) {
          const existing = edit.shopifySnapshot.variants.filter((variant) => !removedVariantIds.includes(variant.id));
          const rows: VariantRow[] = existing.map((variant) => {
            const shopifyOptions = withNormalizedColorOptions(optionOverrides[variant.id] || variant.selectedOptions);
            const colorValue = shopifyOptions.find((option) => option.name.toLowerCase() === "color")?.value || "";
            return {
            key: variant.id,
            label: shopifyOptions.map((option) => option.value).join(" / ") || "Standard",
            length: variant.selectedOptions.find((option) => option.name.toLowerCase() === "length")?.value.replace(/\D/g, "") || "",
            option: variant.selectedOptions.find((option) => option.name.toLowerCase() === "style")?.value || "",
            color: colorValue,
            shopifyOptions,
          };
          });
          if (isBundleDeal && selectedLengths.length && rows.length === 1 &&
              JSON.stringify(selectedLengths) !== JSON.stringify(initialBundleLengths.current)) {
            const row = rows[0];
            const bundleOption = row.shopifyOptions?.find((option) => /bundle deal/i.test(option.value));
            if (bundleOption) {
              const nextValue = `Bundle Deal — ${selectedLengths.map((length) => `${length}\"`).join(" + ")}`;
              row.shopifyOptions = row.shopifyOptions?.map((option) => option === bundleOption ? { ...option, value: nextValue } : option);
              row.label = nextValue;
            }
          }
          const lengthAxis = edit.shopifySnapshot.options.find((axis) => axis.name.toLowerCase() === "length");
          if (!lengthAxis) {
            for (const item of manualCombinations) rows.push({ key: item.key, label: item.options.map((option) => option.value).join(" / "),
              length: "", option: "", color: "", shopifyOptions: item.options });
            return rows;
          }
          const existingLengths = new Set(edit.shopifySnapshot.variants.flatMap((variant) => variant.selectedOptions
            .filter((option) => option.name === lengthAxis.name).map((option) => option.value.replace(/\D/g, ""))));
          const patterns = new Map<string, Array<{ name: string; value: string }>>();
          for (const variant of edit.shopifySnapshot.variants) {
            const pattern = variant.selectedOptions.filter((option) => option.name !== lengthAxis.name);
            patterns.set(JSON.stringify(pattern), pattern);
          }
          for (const length of selectedLengths.filter((value) => !existingLengths.has(value))) {
            for (const pattern of patterns.values()) {
              const shopifyOptions = edit.shopifySnapshot.options.map((axis) => axis.name === lengthAxis.name
                ? { name: axis.name, value: `${length}\"` }
                : pattern.find((option) => option.name === axis.name) || { name: axis.name, value: axis.values[0]?.name || "" });
              rows.push({ key: `NEW__${length}__${JSON.stringify(pattern)}`, label: shopifyOptions.map((option) => option.value).join(" / "),
                length, option: "", color: "", shopifyOptions });
            }
          }
          for (const item of manualCombinations) rows.push({ key: item.key, label: item.options.map((option) => option.value).join(" / "),
            length: item.options.find((option) => option.name.toLowerCase() === "length")?.value.replace(/\D/g, "") || "",
            option: "", color: "", shopifyOptions: item.options });
          return rows;
        }
        if (
          !productType
        ) {
          return [];
        }

        if (
          productType ===
          "HAIR_ESSENTIAL"
        ) {
          return [
            {
              key:
                "DEFAULT",

              label:
                "Standard",

              length:
                "",

              option:
                "",

              color:
                selectedColors[0] ||
                DEFAULT_HAIR_COLOR,
            },
          ];
        }

        if (
          isBundleDeal
        ) {
          if (
            selectedLengths.length ===
            0
          ) {
            return [];
          }

          return [
            {
              key:
                `BUNDLE_DEAL__${selectedLengths.join(
                  "_",
                )}`,
              label:
                 `Bundle Deal — ${selectedLengths
                  .map(
                    (length) =>
                      `${length}"`,
                  )
                  .join(
                    " + ",
                  )}`,
              length: "",
              option:
                "BUNDLE_DEAL",
              color:
                selectedColors[0] ||
                DEFAULT_HAIR_COLOR,
            },
          ];
        }

        if (
          selectedLengths.length ===
          0
        ) {
          return [];
        }

        const optionVariants =
          optionsAreVariants &&
          selectedOptions.length >
            0
            ? selectedOptions
            : [""];

        const colorVariants =
          selectedColors.length >
            0
            ? selectedColors
            : [DEFAULT_HAIR_COLOR];

        const rows:
          VariantRow[] =
          [];

        for (
          const length of
          selectedLengths
        ) {
          for (
            const option of
            optionVariants
          ) {
            for (
              const colorValue of
              colorVariants
            ) {
              const showColorInLabel =
                colorVariants.length >
                1;

              const labelParts =
                [
                  `${length}"`,
                  option
                    ? optionLabel(
                        option,
                      )
                    : "",
                  showColorInLabel
                    ? colorValue
                    : "",
                ].filter(
                  Boolean,
                );

              rows.push({
                key:
                  `${length}__${
                    option ||
                    "NO_OPTION"
                  }__${colorValue}`,

                length,

                option,

                color:
                  colorValue,

                label:
                  labelParts.join(
                    " / ",
                  ),
              });
            }
          }
        }

        return rows;
      },
      [
        edit,
        removedVariantIds,
        optionOverrides,
        manualCombinations,
        productType,
        isBundleDeal,
        selectedLengths,
        optionsAreVariants,
        selectedOptions,
        selectedColors,
        currentOptions,
      ],
    );

  function setVariantField(
    key:
      string,
    field:
      | "price"
      | "salePrice"
      | "inventory"
      | "sku",
    value:
      string,
  ) {
    setVariantValues(
      (
        current,
      ) => ({
        ...current,

        [key]: {
          price:
            current[
              key
            ]?.price ||
            "",

          salePrice:
            current[
              key
            ]?.salePrice ||
            "",

          inventory:
            current[
              key
            ]
              ?.inventory ||
            "",

          sku:
            current[
              key
            ]?.sku ||
            "",

          [field]:
            value,
        },
      }),
    );
  }

  function addSelectedColor() {
    const resolved = normalizeHairColor(
      color ===
      "Other / Custom"
        ? customColor.trim()
        : color,
    );

    if (!resolved) {
      return;
    }

    if (
      !selectedColors.includes(
        resolved,
      )
    ) {
      setSelectedColors(
        (
          current,
        ) => [
          ...current,
          resolved,
        ],
      );
    }

    if (
      color ===
      "Other / Custom"
    ) {
      setCustomColor(
        "",
      );
    }
  }

  function removeSelectedColor(
    colorValue: string,
  ) {
    setSelectedColors(
      (
        current,
      ) =>
        current.length <=
        1
          ? current
          : current.filter(
              (item) =>
                item !==
                colorValue,
            ),
    );
  }

  function addCustomLength() {
    const clean =
      customLength
        .replace(
          /[^0-9.]/g,
          "",
        )
        .trim();

    if (!clean) {
      return;
    }

    if (
      !customLengths.includes(
        clean,
      )
    ) {
      setCustomLengths(
        (
          current,
        ) => [
          ...current,
          clean,
        ],
      );
    }

    if (
      !selectedLengths.includes(
        clean,
      )
    ) {
      setSelectedLengths(
        (
          current,
        ) => [
          ...current,
          clean,
        ],
      );
    }

    setCustomLength(
      "",
    );
  }

  function autoPriceByLength() {
    const base =
      Number(
        startingPrice,
      );

    const increase =
      Number(
        priceIncrease ||
          "0",
      );

    if (
      !Number.isFinite(
        base,
      )
    ) {
      return;
    }

    const lengths =
      Array.from(
        new Set(
          variantRows.map(
            (
              row,
            ) =>
              row.length,
          ),
        ),
      ).sort(
        (
          a,
          b,
        ) =>
          Number(a) -
          Number(b),
      );

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          const position =
            lengths.indexOf(
              row.length,
            );

          next[row.key] = {
            price:
              (
                base +
                Math.max(
                  0,
                  position,
                ) *
                  increase
              ).toFixed(
                2,
              ),

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              next[
                row.key
              ]
                ?.inventory ||
              "",

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function fillAllPrices() {
    if (
      !quickPrice
    ) {
      return;
    }

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          next[row.key] = {
            price:
              quickPrice,

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              next[
                row.key
              ]
                ?.inventory ||
              "",

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function fillAllInventory() {
    if (
      !quickInventory
    ) {
      return;
    }

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          next[row.key] = {
            price:
              next[
                row.key
              ]?.price ||
              "",

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              quickInventory,

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function handleImages(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const files =
      Array.from(
        event.target
          .files ||
          [],
      );

    if (edit) {
      const existingCount = edit.shopifySnapshot.media.filter((item) => item.mediaContentType === "IMAGE" && !removedMediaIds.includes(item.id)).length;
      const remainingCount = Math.max(0, 10 - existingCount - newMedia.filter((item) => item.kind === "IMAGE").length);
      const items = files.slice(0, remainingCount).map((file) => ({ key: crypto.randomUUID(), file, kind: "IMAGE" as const }));
      setNewMedia((current) => [...current, ...items]);
      setMediaOrder((current) => [...current, ...items.map((item) => item.key)]);
      event.target.value = "";
      return;
    }

    const remaining =
      10 -
      images.length;

    setImages(
      (
        current,
      ) => [
        ...current,
        ...files.slice(
          0,
          remaining,
        ),
      ],
    );

    event.target.value =
      "";
  }

  function handleVideos(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const files =
      Array.from(
        event.target
          .files ||
          [],
      );

    if (edit) {
      const existingCount = edit.shopifySnapshot.media.filter((item) => item.mediaContentType === "VIDEO" && !removedMediaIds.includes(item.id)).length;
      const remainingCount = Math.max(0, 3 - existingCount - newMedia.filter((item) => item.kind === "VIDEO").length);
      const items = files.slice(0, remainingCount).map((file) => ({ key: crypto.randomUUID(), file, kind: "VIDEO" as const }));
      setNewMedia((current) => [...current, ...items]);
      setMediaOrder((current) => [...current, ...items.map((item) => item.key)]);
      event.target.value = "";
      return;
    }

    const remaining =
      3 -
      videos.length;

    setVideos(
      (
        current,
      ) => [
        ...current,
        ...files.slice(
          0,
          remaining,
        ),
      ],
    );

    event.target.value =
      "";
  }

  async function generateHairGrabDescription() {
    if (!productType) {
      setAiMessage("Choose a Product Type first so HairGrab AI can write an accurate description.");
      return;
    }

    setAiWriting(true);
    setAiMessage("");

    try {
      const response = await fetch("/seller/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "write",
          details: {
            title,
            productType,
            material: resolvedMaterial,
            colors: selectedColors,
            texture,
            lengths: [...selectedLengths, ...customLengths],
            density: selectedDensities,
            laceSize: selectedLaceSizes,
            laceType: selectedLaceTypes,
            capSize,
            capType: selectedCapTypes,
            bundleWeight,
            classifications: searchClassifications,
            options: selectedOptions,
          },
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.text) {
        throw new Error(result?.message || "HairGrab AI is unavailable right now.");
      }

      setDescription(String(result.text).trim());
      setAiMessage("HairGrab AI created a description from the product details above. Review it before saving.");
    } catch (error) {
      setAiMessage(
        error instanceof Error
          ? error.message
          : "HairGrab AI is unavailable right now.",
      );
    } finally {
      setAiWriting(false);
    }
  }

  const hasPrices =
    variantRows.length >
      0 &&
    variantRows.every(
      (
        row,
      ) => {
        const regularPrice =
          Number(
            variantValues[
              row.key
            ]?.price ||
            "",
          );

        if (
          !Number.isFinite(
            regularPrice,
          ) ||
          regularPrice < 0
        ) {
          return false;
        }

        if (!onSale) {
          return true;
        }

        const salePrice =
          Number(
            variantValues[
              row.key
            ]?.salePrice ||
            "",
          );

        return (
          Number.isFinite(
            salePrice,
          ) &&
          salePrice >= 0 &&
          salePrice <
            regularPrice
        );
      },
    );

  const flatRateIsValid =
    shippingMethod !==
      "Flat Rate Shipping" ||
    Number(
      flatRateShipping,
    ) > 0;

  // "Review Product" (below) is disabled until every one of these
  // is satisfied. That used to be a single opaque boolean with no
  // way for a seller (or anyone auditing this screen) to tell WHY
  // the button wouldn't respond — from the outside a permanently
  // disabled button and a missing final-save action look
  // identical. This keeps the exact same requirements, just makes
  // them individually visible so the gate is diagnosable instead
  // of a silent dead end.
  const missingRequirements: string[] =
    [];

  if (
    !title.trim()
  ) {
    missingRequirements.push(
      "Product title",
    );
  }

  if (
    !description.trim()
  ) {
    missingRequirements.push(
      "Product description",
    );
  }

  if (
    productType ===
    null
  ) {
    missingRequirements.push(
      "Product type",
    );
  }

  if (
    !resolvedMaterial
  ) {
    missingRequirements.push(
      "Material",
    );
  }

  if (
    selectedColors.length ===
    0
  ) {
    missingRequirements.push(
      "At least one color",
    );
  }

  if (
    !shippingMethod
  ) {
    missingRequirements.push(
      "Shipping method",
    );
  }

  if (
    !flatRateIsValid
  ) {
    missingRequirements.push(
      "A flat rate shipping amount greater than $0",
    );
  }

  if (
    !selectedShipsWithin.length
  ) {
    missingRequirements.push(
      "Ships Within timeframe",
    );
  }

  if (
    !returnPolicy
  ) {
    missingRequirements.push(
      "Return policy",
    );
  }

  if (
    !showOnMap
  ) {
    missingRequirements.push(
      "Show on map selection",
    );
  }

  if (
    !hasPrices
  ) {
    if (
      variantRows.length ===
      0
    ) {
      missingRequirements.push(
        isBundleDeal
          ? "At least one length for the Bundle Deal"
          : "At least one length",
      );
    } else {
      missingRequirements.push(
        onSale
          ? "A valid Regular Price and a Sale Price lower than Regular Price for every length"
          : "A valid price for every length",
      );
    }
  }

  const ready =
    missingRequirements.length ===
    0;

  // parseCsvText, normalizeCsvHeader, and the title-inference logic
  // (now inferProductDetailsFromTitle) moved to ../csv-product-import
  // in Phase 2A. inferHairGrabDetails is gone: title-based guesses no
  // longer stand in unchallenged for productType/texture/material/
  // laceSize -- see resolveCsvProductFields usage below, which prefers
  // an explicit structured CSV column, validates it against the same
  // controlled vocabulary as this form, and only falls back to title
  // inference (flagged needsConfirmation) when no structured column is
  // present. productOption (the sub-style, e.g. Clip-In vs Tape-In) is
  // not one of the fields item D named, so it keeps using the same
  // title-inference heuristic as before, unchanged.

  function resolveStructuredProductOptionChoice(productType: ProductType, raw: string) {
    return resolveStructuredProductOption(raw, productOptions[productType] || []);
  }

  async function handleCsvFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setCsvFileName("");
      setCsvPreview(null);
      setCsvReviewOpen(false);
      return;
    }

    setCsvFileName(file.name);
    setCsvImportSummary(null);
    setCsvImportProgress("");

    const text = await file.text();
    const csvRows = parseCsvText(text);

    if (csvRows.length < 2) {
      setCsvPreview({ rows: 0, products: 0, recognized: [], ready: 0, needsDetails: 0, items: [] });
      setCsvReviewOpen(true);
      return;
    }

    const headers = csvRows[0];
    const normalized = headers.map(normalizeCsvHeader);

    const commonColumns: Array<[string, string[]]> = [
      ["Title", ["title", "name", "productname"]],
      ["Description", ["bodyhtml", "description", "body"]],
      ["SKU", ["variantsku", "sku"]],
      ["Price", ["variantprice", "price"]],
      ["Inventory", ["variantinventoryqty", "inventory", "quantity", "stock", "available"]],
      ["Handle / Product ID", ["handle", "productid", "parentid"]],
      ["Status", ["status", "published"]],
      ["Image", ["imagesrc", "imageurl", "image", "src"]],
      ["Option / Variant", ["option1value", "variant", "variation"]],
    ];

    const recognized = commonColumns
      .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
      .map(([label]) => label);

    const findColumn = (aliases: string[]) =>
      normalized.findIndex((header) => aliases.includes(header));

    const handleIndex = findColumn(["handle", "productid", "parentid"]);
    const titleIndex = findColumn(["title", "name", "productname"]);
    const descriptionIndex = findColumn(["bodyhtml", "description", "body"]);
    const statusIndex = findColumn(["status", "published"]);
    const skuIndex = findColumn(["variantsku", "sku"]);
    const priceIndex = findColumn(["variantprice", "price"]);
    const inventoryIndex = findColumn(["variantinventoryqty", "inventory", "quantity", "stock", "available"]);
    const imageIndex = findColumn(["imagesrc", "imageurl", "image", "src"]);

    const optionNameIndexes = [
      findColumn(["option1name"]),
      findColumn(["option2name"]),
      findColumn(["option3name"]),
    ];
    const optionValueIndexes = [
      findColumn(["option1value", "variant", "variation"]),
      findColumn(["option2value"]),
      findColumn(["option3value"]),
    ];

    // Explicit structured columns for category/texture/material/lace size
    // (item D). When a seller's CSV names one of these columns, its value
    // is validated and preferred over any title-based guess -- see the
    // resolveCsvProductFields call below.
    const structuredColumnIndexes: Record<CsvFieldName, number> = {
      productType: findColumn(STRUCTURED_COLUMN_ALIASES.productType),
      productOption: findColumn(STRUCTURED_COLUMN_ALIASES.productOption),
      texture: findColumn(STRUCTURED_COLUMN_ALIASES.texture),
      material: findColumn(STRUCTURED_COLUMN_ALIASES.material),
      laceSize: findColumn(STRUCTURED_COLUMN_ALIASES.laceSize),
      pieceCount: findColumn(STRUCTURED_COLUMN_ALIASES.pieceCount),
    };
    const structuredFieldNames = Object.keys(structuredColumnIndexes) as CsvFieldName[];

    type Group = {
      key: string;
      title: string;
      description: string;
      rows: number;
      status: string;
      imageUrls: Set<string>;
      sourceOptionNames: string[];
      variants: CsvImportedVariant[];
      structured: Partial<Record<CsvFieldName, string>>;
    };

    const grouped = new Map<string, Group>();
    let lastParentKey = "";

    for (let index = 1; index < csvRows.length; index++) {
      const row = csvRows[index];
      const rawHandle = handleIndex >= 0 ? String(row[handleIndex] || "").trim() : "";
      const rawTitle = titleIndex >= 0 ? String(row[titleIndex] || "").trim() : "";

      // Shopify variant/image continuation rows commonly repeat the handle while
      // leaving the title blank. If a source omits both, keep it with the most
      // recent parent rather than silently turning the row into a new product.
      const key = rawHandle || rawTitle || lastParentKey || `row-${index}`;
      lastParentKey = key;

      const current = grouped.get(key) || {
        key,
        title: rawTitle || key,
        description: "",
        rows: 0,
        status: statusIndex >= 0 ? String(row[statusIndex] || "Unknown") : "Unknown",
        imageUrls: new Set<string>(),
        sourceOptionNames: [],
        variants: [],
        structured: {},
      };

      current.rows += 1;
      if (rawTitle) current.title = rawTitle;
      if (descriptionIndex >= 0 && row[descriptionIndex] && !current.description) {
        current.description = String(row[descriptionIndex]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (statusIndex >= 0 && row[statusIndex]) current.status = String(row[statusIndex]);
      if (imageIndex >= 0 && /^https?:\/\//i.test(String(row[imageIndex] || "").trim())) {
        current.imageUrls.add(String(row[imageIndex]).trim());
      }
      for (const field of structuredFieldNames) {
        const columnIndex = structuredColumnIndexes[field];
        if (columnIndex >= 0 && row[columnIndex] && !current.structured[field]) {
          current.structured[field] = String(row[columnIndex]).trim();
        }
      }

      const optionNames = optionNameIndexes.map((columnIndex, optionIndex) => {
        const supplied = columnIndex >= 0 ? String(row[columnIndex] || "").trim() : "";
        if (supplied) return supplied;
        const hasValue = optionValueIndexes[optionIndex] >= 0 && String(row[optionValueIndexes[optionIndex]] || "").trim();
        return hasValue ? `Option ${optionIndex + 1}` : "";
      });

      optionNames.forEach((name, optionIndex) => {
        if (name && !current.sourceOptionNames[optionIndex]) current.sourceOptionNames[optionIndex] = name;
      });

      const sourceOptionValues = optionValueIndexes.map((columnIndex) =>
        columnIndex >= 0 ? String(row[columnIndex] || "").trim() : "",
      );
      const sku = skuIndex >= 0 ? String(row[skuIndex] || "").trim() : "";
      const price = priceIndex >= 0 ? String(row[priceIndex] || "").replace(/[$,]/g, "").trim() : "";
      const inventory = inventoryIndex >= 0 ? String(row[inventoryIndex] || "").replace(/,/g, "").trim() : "";

      const hasVariantData = Boolean(
        sku || price || inventory || sourceOptionValues.some(Boolean),
      );

      if (hasVariantData) {
        current.variants.push({
          key: `${key}::${index}`,
          price,
          inventory,
          sku,
          sourceOptionValues,
        });
      }

      grouped.set(key, current);
    }

    const items: CsvImportedProduct[] = Array.from(grouped.values())
      .filter((item) => {
        const status = item.status.toLowerCase().trim();
        return status !== "draft" && status !== "archived";
      })
      .map((item) => {
        const variants = item.variants.length > 0
          ? item.variants
          : [{ key: `${item.key}::standard`, price: "", inventory: "", sku: "", sourceOptionValues: [] }];
        const skus = new Set(variants.map((variant) => variant.sku).filter(Boolean));
        const title = item.title || "Untitled product";

        // Structured columns (validated against the same controlled
        // vocabulary as this form) win over title inference; an
        // explicit-but-unrecognized value becomes a row error instead of
        // being silently dropped or silently replaced by a guess; title
        // inference only fills a true gap, and is always flagged
        // needsConfirmation so it can never pass as "ready" on its own.
        const resolved = resolveCsvProductFields(title, {
          productType: item.structured.productType,
          texture: item.structured.texture,
          material: item.structured.material,
          laceSize: item.structured.laceSize,
          pieceCount: item.structured.pieceCount,
        });

        const resolvedProductType = (resolved.productType.value || undefined) as ProductType | undefined;

        // productOption (the sub-style, e.g. Clip-In vs Tape-In) is not one
        // of the four fields item D named for structured-column recognition.
        // A structured column for it is still honored when present (against
        // the sub-style choices for the resolved product type); otherwise it
        // falls back to the same unconfirmed title inference as before.
        const structuredOption = item.structured.productOption && resolvedProductType
          ? resolveStructuredProductOptionChoice(resolvedProductType, item.structured.productOption)
          : null;
        const inferredOption = inferProductDetailsFromTitle(title).productOption;

        return {
          key: item.key,
          title,
          description: item.description,
          rows: item.rows,
          status: item.status || "Unknown",
          skuCount: skus.size,
          variantCount: variants.length,
          imageUrls: Array.from(item.imageUrls).slice(0, 10),
          sourceOptionNames: item.sourceOptionNames.filter(Boolean),
          variants,
          productType: resolvedProductType,
          texture: resolved.texture.value || undefined,
          material: resolved.material.value || undefined,
          laceSize: resolved.laceSize.value || undefined,
          pieceCount: resolved.pieceCount.value || undefined,
          productOption: structuredOption || inferredOption,
          needsConfirmation: resolved.needsConfirmation,
          rowErrors: resolved.errors.length ? resolved.errors : undefined,
        };
      });

    const counts = refreshCsvCounts(items);

    setCsvPreview({
      rows: Math.max(0, csvRows.length - 1),
      products: items.length,
      recognized,
      ...counts,
      items,
    });
    setCsvSelectedKeys([]);
    setCsvBulkProductType("");
    setCsvBulkMaterial("");
    setCsvBulkTexture("");
    setCsvEditingKey(null);
    setCsvReviewOpen(true);
    event.target.value = "";
  }

  function csvMissingDetails(item: CsvImportedProduct) {
    const missing: string[] = [];
    if (item.excluded) return missing;
    if (!item.title.trim()) missing.push("product name");
    if (!item.productType) missing.push("product type");
    if (item.productType && item.productType !== "HAIR_ESSENTIAL") {
      if (!item.material) missing.push("hair material");
      if (!item.texture) missing.push("texture");
    }
    if (item.classification === "LOCS" && !item.locType) {
      missing.push("loc type");
    }
    // A structured CSV column with an unrecognized value never silently
    // passes -- surface it as something that needs the seller's attention
    // before this row can import.
    if (item.rowErrors && item.rowErrors.length > 0) {
      missing.push("a value from the source CSV that needs review (see details below)");
    }
    // A field HairGrab only guessed from the title is not "ready" until the
    // seller confirms it -- guessing correctly by luck must not be enough.
    if (item.needsConfirmation && item.needsConfirmation.length > 0) {
      missing.push("confirmation of a detail guessed from the product title");
    }
    return missing;
  }

  function csvWarnings(item: CsvImportedProduct) {
    const warnings: string[] = [];
    if (item.excluded) return warnings;
    if (!item.description.trim()) warnings.push("no description in source CSV");
    if (item.imageUrls.length === 0) warnings.push("no product images in source CSV");
    const missingPriceCount = item.variants.filter((variant) => String(variant.price || "").trim() === "").length;
    if (missingPriceCount > 0) warnings.push("price not included in source CSV — HairGrab will save a draft with a $0 placeholder until price is synced or updated");
    if (item.status.toLowerCase() === "unknown") warnings.push("source status not provided");
    return warnings;
  }

  function csvItemReady(item: CsvImportedProduct) {
    return !item.imported && !item.excluded && csvMissingDetails(item).length === 0;
  }

  function refreshCsvCounts(items: CsvImportedProduct[]) {
    const active = items.filter((item) => !item.imported && !item.excluded);
    const ready = active.filter(csvItemReady).length;
    const needsDetails = active.filter((item) => !csvItemReady(item)).length;
    return { ready, needsDetails };
  }

  function applyCsvBulkDetails() {
    if (!csvPreview || csvSelectedKeys.length === 0) return;

    const selected = new Set(csvSelectedKeys);
    const items = csvPreview.items.map((item) => {
      if (!selected.has(item.key) || item.imported) return item;
      const next = { ...item, importError: undefined };
      if (csvBulkProductType) {
        next.productType = csvBulkProductType;
        next.productOption = undefined;
        next.classification = undefined;
        next.installationMethod = undefined;
        next.locType = undefined;
        next.laceSize = undefined;
      }
      if (csvBulkMaterial) next.material = csvBulkMaterial;
      if (csvBulkTexture) next.texture = csvBulkTexture;
      return next;
    });
    const counts = refreshCsvCounts(items);
    setCsvPreview({ ...csvPreview, items, ...counts });
  }

  function toggleCsvProduct(key: string) {
    setCsvSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function toggleCsvExclude(key: string) {
    if (!csvPreview) return;
    const items = csvPreview.items.map((item) =>
      item.key === key
        ? { ...item, excluded: !item.excluded, importError: undefined }
        : item,
    );
    setCsvSelectedKeys((current) => current.filter((itemKey) => itemKey !== key));
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function clearCsvImport() {
    setCsvFileName("");
    setCsvPreview(null);
    setCsvReviewOpen(false);
    setCsvSelectedKeys([]);
    setCsvEditingKey(null);
    setCsvImportSummary(null);
    setCsvImportProgress("");
  }

  // Fields that resolveCsvProductFields can flag needsConfirmation on --
  // an explicit seller edit to one of these fields counts as the
  // confirmation, so it's cleared from the pending list below.
  const CSV_CONFIRMABLE_FIELDS: CsvFieldName[] = ["productType", "productOption", "texture", "material", "laceSize"];

  function updateCsvProduct(key: string, changes: Partial<CsvImportedProduct>) {
    if (!csvPreview) return;
    const editedFields = new Set(Object.keys(changes) as CsvFieldName[]);
    const items = csvPreview.items.map((item) => {
      if (item.key !== key) return item;
      const nextNeedsConfirmation = (item.needsConfirmation || []).filter(
        (field) => !CSV_CONFIRMABLE_FIELDS.includes(field) || !editedFields.has(field),
      );
      return { ...item, ...changes, importError: undefined, needsConfirmation: nextNeedsConfirmation };
    });
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function updateCsvVariant(productKey: string, variantKey: string, field: "price" | "inventory" | "sku", value: string) {
    if (!csvPreview) return;
    const items = csvPreview.items.map((item) => {
      if (item.key !== productKey) return item;
      return {
        ...item,
        importError: undefined,
        variants: item.variants.map((variant) =>
          variant.key === variantKey ? { ...variant, [field]: value } : variant,
        ),
      };
    });
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function csvProductPayload(item: CsvImportedProduct): ProductPayload {
    const colorOptionIndex = item.sourceOptionNames.findIndex((name) => /color|colour/i.test(name));
    const lengthOptionIndex = item.sourceOptionNames.findIndex((name) => /length|size/i.test(name));
    const colors = normalizeHairColors(
      colorOptionIndex >= 0
        ? item.variants.map((variant) => variant.sourceOptionValues[colorOptionIndex]).filter(Boolean)
        : [DEFAULT_HAIR_COLOR],
    );

    return {
      title: item.title.trim(),
      description: item.description.trim() || `${item.title.trim()} — imported from the seller's existing catalog. Review this description before publishing.`,
      productType: item.productType as ProductType,
      material: item.productType === "HAIR_ESSENTIAL" ? "Not Applicable" : String(item.material || ""),
      colors: colors.length > 0 ? colors : [DEFAULT_HAIR_COLOR],
      texture: item.productType === "HAIR_ESSENTIAL" ? "Not Applicable" : String(item.texture || ""),
      selectedOptions: item.productOption && !LEGACY_WIG_CAP_OPTIONS.some((option) => option.value === item.productOption) ? [item.productOption] : [],
      optionsAreVariants: false,
      searchClassifications: item.classification ? [item.classification] : [],
      installationMethods: item.installationMethod ? [item.installationMethod] : [],
      locType: item.locType || "",
      density: item.density || "",
      laceSize: item.laceSize || "",
      laceType: item.laceType || "",
      capSize: item.capSize || "",
      capType: item.capType || LEGACY_WIG_CAP_OPTIONS.find((option) => option.value === item.productOption)?.label || "",
      origin: "",
      weftType: item.productOption === "NO_WEFT" ? "No Weft" : item.productOption === "WEFT" ? "Weft" : "",
      shipsFromCity: seller.city || "",
      shipsFromState: seller.state || "",
      shippingTerritory: seller.sellsNationwide ? "Nationwide" : "Local",
      bundleWeight: item.bundleWeight || "100g",
      pieceCount: item.pieceCount || "",
      shippingMethod: "Free Shipping",
      flatRateShipping: "",
      localPickupAvailable: false,
      localDeliveryAvailable: false,
      sameDayDelivery: false,
      shipsWithin: "48 Hours",
      returnPolicy: "14-Day Returns",
      showOnMap: "Yes",
      imageUrls: item.imageUrls,
      sourceOptionNames: item.sourceOptionNames,
      variants: item.variants.map((variant, index) => {
        const rawLength = lengthOptionIndex >= 0 ? variant.sourceOptionValues[lengthOptionIndex] || "" : "";
        const numericLength = rawLength.match(/\d+(?:\.\d+)?/)?.[0] || "";
        return {
          label: variant.sourceOptionValues.filter(Boolean).join(" / ") || `Variant ${index + 1}`,
          length: numericLength,
          option: "",
          color: normalizeHairColor(colorOptionIndex >= 0 ? variant.sourceOptionValues[colorOptionIndex] || colors[0] || DEFAULT_HAIR_COLOR : colors[0] || DEFAULT_HAIR_COLOR),
          price: String(variant.price || "").trim() || "0",
          inventory: variant.inventory,
          sku: variant.sku,
          sourceOptionValues: variant.sourceOptionValues,
        };
      }),
    };
  }

  function importReadyCsvProducts() {
    if (!csvPreview || csvImporting) return;
    const readyItems = csvPreview.items.filter(csvItemReady);
    if (readyItems.length === 0) return;

    const payloads = readyItems.map((item) => ({
      ...csvProductPayload(item),
      csvSourceKey: item.key,
    }));

    const formData = new FormData();
    formData.append("csvBatchPayload", JSON.stringify(payloads));
    setCsvImporting(true);
    setCsvImportSummary(null);
    setCsvImportProgress(`Adding ${readyItems.length} ready product${readyItems.length === 1 ? "" : "s"} to My Products...`);
    csvImportFetcher.submit(formData, { method: "post" });
  }

  useEffect(() => {
    const result = csvImportFetcher.data as any;
    if (!result?.csvBatch || !csvPreview) return;

    const resultByKey = new Map<string, any>(
      Array.isArray(result.results)
        ? result.results.map((entry: any) => [String(entry.key || ""), entry])
        : [],
    );

    const items = csvPreview.items.map((item) => {
      const entry = resultByKey.get(item.key);
      if (!entry) return item;
      return entry.success
        ? { ...item, imported: true, importError: undefined }
        : { ...item, importError: String(entry.message || "Add failed") };
    });

    const failures = Array.isArray(result.results)
      ? result.results
          .filter((entry: any) => !entry.success)
          .map((entry: any) => `${entry.title}: ${entry.message}`)
      : [];

    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
    setCsvImportSummary({
      imported: Number(result.imported || 0),
      failed: Number(result.failed || failures.length || 0),
      failures,
    });
    setCsvSelectedKeys((current) =>
      current.filter((key) => !items.find((item) => item.key === key)?.imported),
    );
    setCsvImportProgress("");
    setCsvImporting(false);
  // We intentionally react only when the batch fetcher receives a new result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvImportFetcher.data]);


  function saveProduct(
    saveAsDraft = false,
  ) {
    if (edit) {
      const existingById = new Map(edit.shopifySnapshot.variants.map((variant) => [variant.id, variant]));
      const changed = variantRows.filter((row) => existingById.has(row.key)).map((row) => {
        const before = existingById.get(row.key)!;
        const data = variantValues[row.key];
        if (!data) return before;
        return { ...variantFieldsToShopify(before, data, onSale), selectedOptions: row.shopifyOptions || before.selectedOptions };
      });
      const additions = variantRows.filter((row) => !existingById.has(row.key)).map((row) => {
        const data = variantValues[row.key] || { price: "", salePrice: "", inventory: "", sku: "" };
        return {
          selectedOptions: row.shopifyOptions || [],
          price: onSale && data.salePrice ? data.salePrice : data.price,
          compareAtPrice: onSale && data.salePrice ? data.price : null,
          inventoryQuantity: data.inventory === "" ? null : Number(data.inventory),
          sku: data.sku.trim() || null,
        };
      });
      const variants = { existing: edit.shopifySnapshot.variants, changes: changed, additions, removedIds: removedVariantIds };
      const media = { existing: edit.shopifySnapshot.media,
        added: newMedia.map((item) => ({ localKey: item.key, alt: item.file.name })),
        removedIds: removedMediaIds, order: mediaOrder };
      try {
        diffVariants(edit.shopifySnapshot.variants, variants);
        diffMedia(edit.shopifySnapshot.media, media);
      } catch (error) { window.alert(error instanceof Error ? error.message : "Invalid product edit"); return; }
      const fields = { title: title.trim(), description: description.trim(), productType,
        selectedOptions, searchClassifications, installationMethods, locType,
        material: resolvedMaterial, colors: selectedColors, texture, density: selectedDensities, laceSize: selectedLaceSizes, laceType: selectedLaceTypes, capSize, capType: selectedCapTypes,
        origin, weftType, shipsFromCity, shipsFromState, shippingTerritory,
        bundleWeight, pieceCount, lengths: [...selectedLengths, ...customLengths],
        shippingMethod, flatRateShipping, localPickupAvailable, localDeliveryAvailable,
        sameDayDelivery, shipsWithin: selectedShipsWithin, returnPolicy, showOnMap };
      const changedFields = Object.keys(fields).filter((key) =>
        JSON.stringify((fields as Record<string, unknown>)[key]) !== JSON.stringify(initialEditFields.current?.[key]));
      setEditDirty(false);
      const formData = new FormData();
      formData.append("intent", "builderSave");
      formData.append("builderEdit", JSON.stringify({ baseline: edit.shopifySnapshot, variants, media, fields, changedFields }));
      for (const item of newMedia) formData.append(`media:${item.key}`, item.file);
      saveFetcher.submit(formData, { method: "post", encType: "multipart/form-data", action: `/seller/edit-product/${edit.coreProductId}` });
      return;
    }
    if (
      !productType ||
      !title.trim() ||
      (!saveAsDraft &&
        !ready)
    ) {
      return;
    }

    const payload:
      ProductPayload =
      {
        title:
          title.trim(),

        description:
          description.trim(),

        productType,

        material:
          resolvedMaterial,

        colors:
          selectedColors,

        texture,

        selectedOptions,

        optionsAreVariants,

        searchClassifications,

        installationMethods,

        locType,

        density: selectedDensities,

        laceSize: selectedLaceSizes,

        laceType: selectedLaceTypes,

        capSize,

        capType: selectedCapTypes,

        origin,

        weftType:
          weftType ||
          (selectedOptions.includes("NO_WEFT")
            ? "No Weft"
            : selectedOptions.includes("WEFT")
              ? "Weft"
              : ""),

        shipsFromCity:
          shipsFromCity || seller.city || "",

        shipsFromState:
          shipsFromState || seller.state || "",

        shippingTerritory:
          shippingTerritory || (seller.sellsNationwide ? "Nationwide" : "Local"),

        bundleWeight,

        pieceCount,

        shippingMethod,

        flatRateShipping:
          shippingMethod ===
            "Flat Rate Shipping"
            ? flatRateShipping
            : "",

        localPickupAvailable:
          seller.offersLocalPickup &&
          localPickupAvailable,

        localDeliveryAvailable:
          seller.offersLocalDelivery &&
          localDeliveryAvailable,

        sameDayDelivery,

        shipsWithin: selectedShipsWithin,

        returnPolicy,

        showOnMap,

        variants:
          (variantRows.length > 0
            ? variantRows
            : saveAsDraft
              ? [
                  {
                    key: "DRAFT",
                    label: "Draft",
                    length: "",
                    option: "",
                    color:
                      selectedColors[0] ||
                      DEFAULT_HAIR_COLOR,
                  },
                ]
              : []
          ).map(
            (
              row,
            ) => ({
              label:
                row.label,

              length:
                row.length,

              option:
                row.option,

              color:
                row.color,

              price:
                variantValues[
                  row.key
                ]?.price ||
                (saveAsDraft
                  ? "0"
                  : ""),

              salePrice:
                onSale
                  ? variantValues[
                      row.key
                    ]?.salePrice ||
                    ""
                  : "",

              inventory:
                variantValues[
                  row.key
                ]
                  ?.inventory ||
                "",

              sku:
                variantValues[
                  row.key
                ]?.sku ||
                "",
            }),
          ),
      };

    const formData =
      new FormData();

    formData.append(
      "productPayload",
      JSON.stringify(
        payload,
      ),
    );

    formData.append(
      "saveAsDraft",
      saveAsDraft
        ? "true"
        : "false",
    );

    for (
      const image of
      images
    ) {
      formData.append(
        "images",
        image,
      );
    }

    for (
      const video of
      videos
    ) {
      formData.append(
        "videos",
        video,
      );
    }

    saveFetcher.submit(
      formData,
      {
        method:
          "post",

        encType:
          "multipart/form-data",
      },
    );
  }

  // ========================================================
  // REVIEW SCREEN
  // ========================================================

  if (
    reviewing
  ) {
    return (
      <PageShell onChange={() => edit && setEditDirty(true)}>
        {edit && showEditSaved && <div role="status" style={{ position: "fixed", zIndex: 20, left: "50%", bottom: 24, transform: "translateX(-50%)", background: "#4B1678", color: "#fff", borderRadius: 12, padding: "12px 18px", boxShadow: "0 8px 24px rgba(75,22,120,.28)", fontWeight: 800, fontSize: 13, width: "min(92vw, 360px)", textAlign: "center" }}>✓ Changes saved</div>}
        <div
          style={{
            color:
              "#7b3fa0",

            fontWeight:
              "800",

            fontSize:
              "11px",
          }}
        >
          HAIRGRAB PRODUCT REVIEW
        </div>

        <h1
          style={{
            color:
              "#4B1678",

            margin:
              "6px 0",
          }}
        >
          Review Product
        </h1>

        <p>
          Seller:{" "}
          <strong>
            {
              seller.businessName
            }
          </strong>
        </p>

        {onSale && (
          <div
            style={{
              margin:
                "12px 0 16px",

              padding:
                "11px 12px",

              border:
                "1px solid #edd8a6",

              borderRadius:
                "9px",

              background:
                "#fff8e8",

              color:
                "#6f5516",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            SALE PRODUCT — each variant will use the Sale Price as the shopper price and the Regular Price as the crossed-out compare-at price.
          </div>
        )}


        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            {title}
          </h2>

          <p
            style={{
              whiteSpace:
                "pre-wrap",
            }}
          >
            {description}
          </p>
        </div>

        <div
          style={
            sectionStyle
          }
        >
          <ReviewGrid>
            <ReviewValue
              label="Type"
              value={
                productTypes.find(
                  (
                    type,
                  ) =>
                    type.value ===
                    productType,
                )?.label ||
                ""
              }
            />

            <ReviewValue
              label="Hair Type"
              value={
                resolvedMaterial
              }
            />

            <ReviewValue
              label="Color"
              value={
                selectedColors.join(
                  ", ",
                )
              }
            />

            <ReviewValue
              label="Texture"
              value={
                texture ||
                "—"
              }
            />

            {origin ? (
              <ReviewValue
                label="Origin"
                value={origin}
              />
            ) : null}

            {selectedLaceTypes.length ? (
              <ReviewValue
                label="Lace Type"
                value={selectedLaceTypes.join(", ")}
              />
            ) : null}

            {selectedLaceSizes.length ? (
              <ReviewValue
                label="Lace Size"
                value={selectedLaceSizes.join(", ")}
              />
            ) : null}

            {selectedDensities.length ? (
              <ReviewValue
                label="Density"
                value={selectedDensities.join(", ")}
              />
            ) : null}

            {selectedCapTypes.length ? (
              <ReviewValue
                label="Cap Type"
                value={selectedCapTypes.join(", ")}
              />
            ) : null}

            {weftType ? (
              <ReviewValue
                label="Weft Type"
                value={weftType}
              />
            ) : null}

            {productType ===
              "BRAIDING_HAIR" && (
              <ReviewValue
                label="Installation"
                value={
                  installationMethods.length >
                  0
                    ? installationMethodChoices
                        .filter((choice) =>
                          installationMethods.includes(
                            choice.value,
                          ),
                        )
                        .map(
                          (choice) =>
                            choice.label,
                        )
                        .join(", ")
                    : "—"
                }
              />
            )}

            <ReviewValue
              label="Photos"
              value={`${images.length}/10`}
            />

            <ReviewValue
              label="Videos"
              value={`${videos.length}/3`}
            />

            <ReviewValue
              label="Shipping"
              value={
                shippingMethod
              }
            />

            <ReviewValue
              label="Ships Within"
              value={
                selectedShipsWithin.join(", ")
              }
            />

            <ReviewValue
              label="Return Policy"
              value={
                returnPolicy
              }
            />

            <ReviewValue
              label="Show on HairGrab Map"
              value={
                showOnMap
              }
            />
          </ReviewGrid>

          {(images.length > 0 ||
            videos.length > 0) && (
            <div
              style={{
                marginTop:
                  "18px",

                paddingTop:
                  "16px",

                borderTop:
                  "1px solid #eee7f2",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",

                  marginBottom:
                    "8px",
                }}
              >
                Media Preview
              </div>

              <ReviewMediaPreview
                images={
                  images
                }
                videos={
                  videos
                }
              />
            </div>
          )}
        </div>

        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Variants & Pricing
          </h2>

          <div
            style={{
              overflowX:
                "auto",
            }}
          >
            <table
              style={{
                width:
                  "100%",

                borderCollapse:
                  "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f7f0fb",
                  }}
                >
                  <th
                    style={
                      thStyle
                    }
                  >
                    Variant
                  </th>

                  <th
                    style={
                      thStyle
                    }
                  >
                    {onSale
                      ? "Regular Price"
                      : "Price"}
                  </th>

                  {onSale && (
                    <th style={thStyle}>
                      Sale Price
                    </th>
                  )}

                  <th
                    style={
                      thStyle
                    }
                  >
                    Inventory
                  </th>

                  <th
                    style={
                      thStyle
                    }
                  >
                    SKU
                  </th>
                </tr>
              </thead>

              <tbody>
                {variantRows.map(
                  (
                    row,
                  ) => (
                    <tr
                      key={
                        row.key
                      }
                    >
                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          row.label
                        }
                      </td>

                      <td
                        style={
                          tdStyle
                        }
                      >
                        $
                        {
                          variantValues[
                            row.key
                          ]?.price
                        }
                      </td>

                      {onSale && (
                        <td style={tdStyle}>
                          $
                          {
                            variantValues[
                              row.key
                            ]?.salePrice ||
                            "—"
                          }
                        </td>
                      )}

                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          variantValues[
                            row.key
                          ]
                            ?.inventory ||
                          "—"
                        }
                      </td>

                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          variantValues[
                            row.key
                          ]?.sku ||
                          "—"
                        }
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            ...sectionStyle,

            display:
              "flex",

            gap:
              "10px",

            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              setReviewing(
                false,
              )
            }
            style={
              secondaryButton
            }
          >
            ← Back to Edit
          </button>

          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              saveProduct(false)
            }
            style={
              primaryButton
            }
          >
            {saving ? (edit ? "Saving…" : "Saving Product...") : edit && saveResult?.success && !editDirty ? "✓ Saved" : "Save Product"}
          </button>
        </div>

        {saveResult?.message && (
          <PostSaveSellerActions
            bannerRef={successBannerRef}
            message={saveResult.message}
            success={Boolean(saveResult.success)}
            storeViewHref={productStoreViewHref({
              handle:
                saveResult.productHandle ||
                edit?.product.handle,
              storeSlug: seller.storeSlug,
              storefrontPublished: seller.storefrontPublished,
            })}
            extra={
              saveResult.success &&
              (saveResult.variantCount != null ||
                saveResult.mediaCount != null ||
                saveResult.metafieldsSaved != null) ? (
                <div style={{ marginTop: "6px", fontWeight: "600" }}>
                  {saveResult.variantCount ?? 0} variant(s) saved · {saveResult.mediaCount ?? 0} media file(s)
                  {" · "}
                  {saveResult.metafieldsSaved || 0} metafield(s) filled
                  {Boolean(saveResult.metafieldsSkipped) && (
                    <>
                      {" · "}
                      {saveResult.metafieldsSkipped} incompatible field(s) skipped
                    </>
                  )}
                </div>
              ) : null
            }
          />
        )}

        <div
          style={{
            marginTop:
              "10px",

            textAlign:
              "center",

            color:
              "#817787",

            fontSize:
              "10px",
          }}
        >
          Once you save your product, HairGrab receives it for review. Approved products will be published to the marketplace.
        </div>
      </PageShell>
    );
  }

  // ========================================================
  // EDIT SCREEN
  // ========================================================

  return (
    <PageShell onChange={() => edit && setEditDirty(true)}>
      {edit && showEditSaved && <div role="status" style={{ position: "fixed", zIndex: 20, left: "50%", bottom: 24, transform: "translateX(-50%)", background: "#4B1678", color: "#fff", borderRadius: 12, padding: "12px 18px", boxShadow: "0 8px 24px rgba(75,22,120,.28)", fontWeight: 800, fontSize: 13, width: "min(92vw, 360px)", textAlign: "center" }}>✓ Changes saved</div>}
      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap:
            "12px",

          flexWrap:
            "wrap",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#7b3fa0",

              fontSize:
                "11px",

              fontWeight:
                "800",

              textTransform:
                "uppercase",
            }}
          >
            {edit ? "HairGrab Product Edit" : "HairGrab Quick Add"}
          </div>

          <h1
            style={{
              margin:
                "5px 0",

              color:
                "#4B1678",
            }}
          >
            {edit ? "Edit Product" : "Add a Product"}
          </h1>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#776e7b",
            }}
          >
            {edit ? "Update the details shoppers see while retaining your existing Shopify variants and media." : "Paste the basics. HairGrab handles the repetitive work."}
          </div>
        </div>

        <div
          style={{
            background:
              "#eef8f0",

            color:
              "#347143",

            borderRadius:
              "20px",

            padding:
              "8px 12px",

            fontWeight:
              "800",

            fontSize:
              "11px",
          }}
        >
          {edit ? "Existing Shopify product" : "Goal: under 2 minutes"}
        </div>
      </div>

      <div
        style={{
          marginTop:
            "18px",

          padding:
            "13px 14px",

          background:
            "#f7f0fb",

          border:
            "1px solid #e2d1ef",

          borderRadius:
            "11px",

          color:
            "#4B1678",

          fontSize:
            "11px",

          lineHeight:
            1.55,
        }}
      >
        <strong>
          Help shoppers find your product.
        </strong>{" "}
        HairGrab uses the details you enter below for search, filters and product matching. Complete every field that applies to your product. Leaving an applicable field blank may keep the product from appearing in some shopper searches or filters.
      </div>



      {!edit && <div
        style={{
          marginTop: "18px",
          padding: "16px",
          border: "1px solid #e3d6ea",
          borderRadius: "14px",
          background: "#fbf8fd",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#4B1678", fontSize: "15px", fontWeight: 900 }}>Bulk Product Import</div>
            <div style={{ marginTop: "4px", color: "#6f6475", fontSize: "11px", lineHeight: 1.5, maxWidth: "650px" }}>
              Bring in an existing product catalog, then finish HairGrab-specific details without rebuilding every listing. HairGrab keeps variants together, carries over source data, suggests classifications from product names, and saves approved products to My Products as Shopify drafts.
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "#4B1678", color: "#fff", padding: "10px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
            Import Catalog
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: "none" }} />
          </label>
        </div>

        {csvFileName && csvPreview && (
          <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#fff", border: "1px solid #eee4f2", fontSize: "11px", color: "#4b3f50" }}>
            <strong>{csvFileName}</strong>
            <div style={{ marginTop: "5px", lineHeight: 1.6 }}>
              {csvPreview.products} product{csvPreview.products === 1 ? "" : "s"} found · {csvPreview.rows} CSV row{csvPreview.rows === 1 ? "" : "s"}
              <br />
              Recognized: {csvPreview.recognized.length > 0 ? csvPreview.recognized.join(", ") : "No common product columns recognized"}
            </div>

            {!csvPreview.recognized.includes("Price") && (
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: "#fff4e5", color: "#7a4d00", lineHeight: 1.5 }}>
                <strong>This looks like an inventory-only CSV.</strong> HairGrab can still save these products to <strong>My Products</strong> as incomplete Shopify drafts without making you type prices or quantities here. Missing prices are stored as a temporary $0 draft value and nothing can go live until the product is completed. For a hands-off import of price, description, images, and inventory, use a full product export or the Shopify connection when enabled.
              </div>
            )}

            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#eef8f0", color: "#276236", fontWeight: 800 }}>
                {csvPreview.ready} ready to add
              </span>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#fff5df", color: "#7a5410", fontWeight: 800 }}>
                {csvPreview.needsDetails} need information
              </span>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#f3eef6", color: "#4B1678", fontWeight: 800 }}>
                {csvPreview.items.filter((item) => item.imported).length} imported
              </span>
            </div>

            <button type="button" onClick={() => setCsvReviewOpen((current) => !current)} style={{ marginTop: "10px", border: 0, borderRadius: "9px", background: "#4B1678", color: "white", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
              {csvReviewOpen ? "Hide Product Review" : "Review & Complete Products"}
            </button>
            <button type="button" onClick={clearCsvImport} style={{ marginLeft: "8px", border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "8px", padding: "8px 10px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
              Exit CSV Import
            </button>
          </div>
        )}

        {csvPreview && csvReviewOpen && (
          <div style={{ marginTop: "12px", background: "white", border: "1px solid #e8deec", borderRadius: "12px", padding: "12px" }}>
            <div style={{ color: "#4B1678", fontWeight: 900, fontSize: "14px" }}>1. Review source data → 2. Add HairGrab details → 3. Save to My Products</div>
            <div style={{ marginTop: "4px", fontSize: "11px", color: "#6f6475", lineHeight: 1.5 }}>
              “Ready to save” means HairGrab has the product name and required HairGrab classification. Source price, quantity, SKU, images, and description are carried over when present. Missing commerce details no longer block saving because the product is created as an incomplete draft, never live.
            </div>

            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "11px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <strong style={{ color: "#4B1678", fontSize: "12px" }}>Bulk Complete Similar Products</strong>
                <button
                  type="button"
                  onClick={() => {
                    const available = csvPreview.items.filter((item) => !item.imported && !item.excluded).map((item) => item.key);
                    setCsvSelectedKeys(csvSelectedKeys.length === available.length ? [] : available);
                  }}
                  style={{ border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "8px", padding: "7px 10px", fontWeight: 800, cursor: "pointer", fontSize: "11px" }}
                >
                  {csvSelectedKeys.length === csvPreview.items.filter((item) => !item.imported && !item.excluded).length ? "Clear All" : "Select All"}
                </button>
              </div>
              <div style={{ marginTop: "8px", fontSize: "10px", color: "#766b79" }}>{csvSelectedKeys.length} selected. Optional shortcut: use this only for products that truly share the same details. You can classify every product individually below.</div>

              <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Product Type
                  <select value={csvBulkProductType} onChange={(event) => setCsvBulkProductType(event.target.value as ProductType | "")} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {productTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Hair Material
                  <select value={csvBulkMaterial} onChange={(event) => setCsvBulkMaterial(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {materials.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Texture
                  <select value={csvBulkTexture} onChange={(event) => setCsvBulkTexture(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {textures.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" disabled={csvSelectedKeys.length === 0 || (!csvBulkProductType && !csvBulkMaterial && !csvBulkTexture)} onClick={applyCsvBulkDetails} style={{ marginTop: "11px", border: 0, borderRadius: "9px", background: "#4B1678", color: "white", padding: "10px 13px", fontWeight: 850, cursor: "pointer", opacity: csvSelectedKeys.length === 0 || (!csvBulkProductType && !csvBulkMaterial && !csvBulkTexture) ? 0.5 : 1 }}>
                Apply to {csvSelectedKeys.length || 0} Selected
              </button>
            </div>

            <div style={{ marginTop: "10px", display: "grid", gap: "8px", maxHeight: "540px", overflowY: "auto" }}>
              {csvPreview.items.map((item) => {
                const missing = csvMissingDetails(item);
                const warnings = csvWarnings(item);
                const readyToImport = csvItemReady(item);
                const priced = item.variants.filter((variant) => String(variant.price).trim() !== "" && Number.isFinite(Number(variant.price))).length;
                const editing = csvEditingKey === item.key;
                const itemOptions = item.productType ? productOptions[item.productType] || [] : [];
                const itemClassifications = item.productType ? productClassifications[item.productType] || [] : [];
                const isLocs = item.classification === "LOCS";
                const showLaceSize = item.productType === "WIG" || item.productType === "CLOSURE_FRONTAL";

                return (
                  <div key={item.key} style={{ border: item.importError ? "1px solid #e9b9b9" : item.excluded ? "1px solid #e2dce5" : "1px solid #eee4f2", borderRadius: "10px", padding: "11px", background: item.imported ? "#f5fbf6" : item.excluded ? "#fafafa" : "white", opacity: item.excluded ? 0.72 : 1 }}>
                    <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                      <input type="checkbox" disabled={Boolean(item.imported) || Boolean(item.excluded)} checked={csvSelectedKeys.includes(item.key)} onChange={() => toggleCsvProduct(item.key)} style={{ marginTop: "4px" }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 850, color: "#2e2432" }}>{item.title}</div>
                            <div style={{ marginTop: "3px", fontSize: "10px", color: "#766b79", lineHeight: 1.45 }}>
                              {item.variantCount} variant{item.variantCount === 1 ? "" : "s"} · {priced}/{item.variantCount} priced · {item.skuCount} SKU{item.skuCount === 1 ? "" : "s"} · {item.imageUrls.length} image{item.imageUrls.length === 1 ? "" : "s"} · Source: {item.status}
                            </div>
                          </div>
                          <span style={{ whiteSpace: "nowrap", padding: "5px 8px", borderRadius: "999px", background: item.imported ? "#e7f5ea" : item.excluded ? "#f0edf2" : readyToImport ? "#eef8f0" : "#fff5df", color: item.imported ? "#276236" : item.excluded ? "#6c6370" : readyToImport ? "#276236" : "#7a5410", fontSize: "10px", fontWeight: 850 }}>
                            {item.imported ? "✓ Imported" : item.excluded ? "Excluded" : readyToImport ? "✓ Ready to add" : "Needs information"}
                          </span>
                        </div>

                        {!item.imported && !item.excluded && (
                          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "7px" }}>
                            <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Product Type *
                              <select value={item.productType || ""} onChange={(event) => updateCsvProduct(item.key, { productType: (event.target.value || undefined) as ProductType | undefined, productOption: undefined, classification: undefined, installationMethod: undefined, locType: undefined, laceSize: undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {productTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                              </select>
                            </label>

                            {item.productType && item.productType !== "HAIR_ESSENTIAL" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Hair Material *
                              <select value={item.material || ""} onChange={(event) => updateCsvProduct(item.key, { material: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {materials.filter((value) => value !== "Not Applicable").map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType && item.productType !== "HAIR_ESSENTIAL" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Texture *
                              <select value={item.texture || ""} onChange={(event) => updateCsvProduct(item.key, { texture: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {textures.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {itemOptions.length > 0 && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Type / Style
                              <select value={item.productOption || ""} onChange={(event) => updateCsvProduct(item.key, { productOption: event.target.value || undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {itemOptions.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {itemClassifications.length > 0 && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Classification
                              <select value={item.classification || ""} onChange={(event) => updateCsvProduct(item.key, { classification: event.target.value || undefined, locType: undefined, installationMethod: undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {itemClassifications.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {isLocs && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Loc Type *
                              <select value={item.locType || ""} onChange={(event) => updateCsvProduct(item.key, { locType: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {locTypeChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {(item.productType === "BRAIDING_HAIR" || isLocs) && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Installation
                              <select value={item.installationMethod || ""} onChange={(event) => updateCsvProduct(item.key, { installationMethod: event.target.value || undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {installationMethodChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {showLaceSize && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Lace Size
                              <select value={item.laceSize || ""} onChange={(event) => updateCsvProduct(item.key, { laceSize: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {laceSizes.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "WIG" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Density
                              <select value={item.density || ""} onChange={(event) => updateCsvProduct(item.key, { density: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {densities.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {showLaceSize && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Lace Type
                              <select value={item.laceType || ""} onChange={(event) => updateCsvProduct(item.key, { laceType: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {laceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "WIG" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Cap Size
                              <select value={item.capSize || ""} onChange={(event) => updateCsvProduct(item.key, { capSize: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {["Small", "Medium", "Large", "Adjustable"].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "BUNDLE" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Bundle Weight
                              <select value={item.bundleWeight || "100g"} onChange={(event) => updateCsvProduct(item.key, { bundleWeight: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                {bundleWeights.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "EXTENSION" && item.productOption === "CLIP_IN" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Piece Count
                              {/* Safety-review fix: no fixed choice list -- a "1".."5+" dropdown
                                  would collapse a real 7-piece set into a lossy bucket. */}
                              <input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                placeholder="e.g. 7"
                                value={item.pieceCount || ""}
                                onChange={(event) => updateCsvProduct(item.key, { pieceCount: event.target.value.replace(/[^0-9]/g, "") })}
                                style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}
                              />
                            </label>}
                          </div>
                        )}

                        {!item.excluded && item.needsConfirmation && item.needsConfirmation.length > 0 && (
                          <div style={{ marginTop: "6px", fontSize: "10px", color: "#8a5d09" }}>
                            Guessed from the product title, please confirm: {item.needsConfirmation.join(", ")}. Changing any of these fields above counts as confirming it.
                          </div>
                        )}

                        {!item.excluded && item.rowErrors && item.rowErrors.length > 0 && (
                          <div style={{ marginTop: "6px", fontSize: "10px", color: "#b03434" }}>
                            {item.rowErrors.join(" ")}
                          </div>
                        )}

                        {false && !item.imported && !item.excluded && (
                          <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
                            <div style={{ fontSize: "10px", fontWeight: 850, color: "#4B1678" }}>
                              {item.variantCount === 1 ? "Price & inventory" : `Variant prices & inventory (${item.variantCount})`}
                            </div>
                            {item.variantCount === 1 ? (
                              <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))", gap: "6px" }}>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Price *
                                  <input aria-label="Price" placeholder="$0.00" inputMode="decimal" value={item.variants[0]?.price || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "price", event.target.value.replace(/[^0-9.]/g, ""))} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Inventory
                                  <input aria-label="Inventory" placeholder="Qty" inputMode="numeric" value={item.variants[0]?.inventory || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "inventory", event.target.value.replace(/[^0-9-]/g, ""))} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>SKU
                                  <input aria-label="SKU" placeholder="Optional" value={item.variants[0]?.sku || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "sku", event.target.value)} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                              </div>
                            ) : (
                              <div style={{ marginTop: "7px", display: "grid", gap: "6px" }}>
                                {item.variants.map((variant, variantIndex) => (
                                  <div key={variant.key} style={{ display: "grid", gridTemplateColumns: "minmax(95px, 1.25fr) repeat(3, minmax(72px, 1fr))", gap: "6px", alignItems: "center", fontSize: "10px" }}>
                                    <div style={{ color: "#5f5364", fontWeight: 700 }}>{variant.sourceOptionValues.filter(Boolean).join(" / ") || `Variant ${variantIndex + 1}`}</div>
                                    <input aria-label="Price" placeholder="$ Price *" inputMode="decimal" value={variant.price} onChange={(event) => updateCsvVariant(item.key, variant.key, "price", event.target.value.replace(/[^0-9.]/g, ""))} style={{ ...fieldStyle, padding: "8px" }} />
                                    <input aria-label="Inventory" placeholder="Qty" inputMode="numeric" value={variant.inventory} onChange={(event) => updateCsvVariant(item.key, variant.key, "inventory", event.target.value.replace(/[^0-9-]/g, ""))} style={{ ...fieldStyle, padding: "8px" }} />
                                    <input aria-label="SKU" placeholder="SKU" value={variant.sku} onChange={(event) => updateCsvVariant(item.key, variant.key, "sku", event.target.value)} style={{ ...fieldStyle, padding: "8px" }} />
                                  </div>
                                ))}
                              </div>
                            )}
                            {missing.some((value) => value.includes("price")) && (
                              <div style={{ marginTop: "6px", fontSize: "9px", color: "#8a5d09" }}>Enter the missing price{item.variantCount === 1 ? "" : "s"} here. You do not need to open another screen.</div>
                            )}
                          </div>
                        )}

                        {!item.excluded && missing.length > 0 && <div style={{ marginTop: "6px", fontSize: "10px", color: "#8a5d09" }}>Still needed before this can be added: {missing.join(", ")}</div>}
                        {!item.excluded && warnings.length > 0 && <div style={{ marginTop: "3px", fontSize: "10px", color: "#7d7480" }}>Review warning: {warnings.join(" · ")}</div>}
                        {item.importError && <div style={{ marginTop: "4px", fontSize: "10px", color: "#a22727" }}>Could not add to My Products: {item.importError}</div>}

                        {!item.imported && !item.excluded && (
                          <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <button type="button" onClick={() => setCsvEditingKey(editing ? null : item.key)} style={{ border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                              {editing ? "Close Extra Details" : "Edit Name / Description"}
                            </button>
                            <button type="button" onClick={() => toggleCsvExclude(item.key)} style={{ border: "1px solid #d8cce0", background: "white", color: "#6c6370", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                              Exclude from Import
                            </button>
                          </div>
                        )}
                        {!item.imported && item.excluded && (
                          <button type="button" onClick={() => toggleCsvExclude(item.key)} style={{ marginTop: "8px", border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                            Include Again
                          </button>
                        )}
                      </div>
                    </div>

                    {editing && !item.imported && !item.excluded && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #eee4f2" }}>
                        <label style={{ fontSize: "10px", fontWeight: 800, color: "#4B1678" }}>Product Name
                          <input value={item.title} onChange={(event) => updateCsvProduct(item.key, { title: event.target.value })} style={{ ...fieldStyle, marginTop: "4px" }} />
                        </label>
                        <label style={{ display: "block", marginTop: "8px", fontSize: "10px", fontWeight: 800, color: "#4B1678" }}>Description
                          <textarea rows={3} value={item.description} onChange={(event) => updateCsvProduct(item.key, { description: event.target.value })} placeholder="Optional during import. This product stays a Shopify draft until you publish it." style={{ ...fieldStyle, marginTop: "4px" }} />
                        </label>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
              <div style={{ fontSize: "11px", color: "#5f5364", lineHeight: 1.5 }}>
                <strong style={{ color: "#4B1678" }}>Ready to save:</strong> {csvPreview.ready} ready · {csvPreview.needsDetails} still need HairGrab classification · {csvPreview.items.filter((item) => item.excluded).length} excluded. Price and quantity are <strong>not required</strong> to save an imported product to My Products. Missing commerce details stay draft-only until completed or synced.
              </div>

              <button
                type="button"
                disabled={csvImporting || csvPreview.ready === 0}
                onClick={() => void importReadyCsvProducts()}
                style={{ marginTop: "10px", width: "100%", border: 0, borderRadius: "10px", background: "#4B1678", color: "white", padding: "12px 14px", fontWeight: 900, cursor: csvImporting || csvPreview.ready === 0 ? "not-allowed" : "pointer", opacity: csvImporting || csvPreview.ready === 0 ? 0.55 : 1 }}
              >
                {csvImporting ? "Adding Products..." : `Save ${csvPreview.ready} Product${csvPreview.ready === 1 ? "" : "s"} to My Products`}
              </button>

              {csvImportProgress && <div style={{ marginTop: "8px", fontSize: "10px", color: "#4B1678" }}>{csvImportProgress}</div>}

              {csvImportSummary && (
                <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: csvImportSummary.failed === 0 ? "#eef8f0" : "#fff4e5", color: csvImportSummary.failed === 0 ? "#276236" : "#7a4d00", fontSize: "11px", lineHeight: 1.5 }}>
                  <strong>{csvImportSummary.imported} product{csvImportSummary.imported === 1 ? "" : "s"} added to My Products successfully.</strong>
                  {csvImportSummary.failed > 0 && <> {csvImportSummary.failed} failed and remain available to fix/retry.</>}
                  {csvImportSummary.failures.length > 0 && (
                    <div style={{ marginTop: "6px" }}>{csvImportSummary.failures.slice(0, 5).map((failure) => <div key={failure}>• {failure}</div>)}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>}

      {!csvPreview && (<>
      {/* PRODUCT INFO */}

      <div
        style={
          sectionStyle
        }
      >
        <h2
          style={
            headingStyle
          }
        >
          Product Information
        </h2>

        <label
          style={
            labelStyle
          }
        >
          Product Name *
        </label>

        <input
          value={
            title
          }
          onChange={(
            event,
          ) =>
            setTitle(
              event.target
                .value,
            )
          }
          style={
            fieldStyle
          }
        />

        <label
          style={{
            ...labelStyle,
            marginTop:
              "15px",
          }}
        >
          Description *
        </label>

        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          style={fieldStyle}
        />

        <button
          type="button"
          disabled={aiWriting}
          onClick={() => void generateHairGrabDescription()}
          style={{
            marginTop: "10px",
            border: "none",
            borderRadius: "10px",
            background: "#4B1678",
            color: "white",
            padding: "10px 14px",
            fontSize: "12px",
            fontWeight: "800",
            cursor: aiWriting ? "wait" : "pointer",
            opacity: aiWriting ? 0.7 : 1,
          }}
        >
          {aiWriting ? "✨ HairGrab AI is writing..." : "✨ Generate with HairGrab AI"}
        </button>

        {aiMessage ? (
          <div
            style={{
              marginTop: "8px",
              color: "#6c5a74",
              fontSize: "12px",
              lineHeight: 1.45,
            }}
          >
            {aiMessage}
          </div>
        ) : null}
      </div>

      {/* TYPE */}

      <div
        style={
          sectionStyle
        }
      >
        <h2
          style={
            headingStyle
          }
        >
          Product Type
        </h2>

        <div
          style={{
            color:
              "#7d7480",

            fontSize:
              "10px",

            lineHeight:
              1.5,

            marginTop:
              "-7px",

            marginBottom:
              "12px",
          }}
        >
          Choose the closest main category. HairGrab uses it to show the right product fields and connect the item to the right shopper filters.
        </div>

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",

            gap:
              "10px",
          }}
        >
          {productTypes.map(
            (
              item,
            ) => (
              <button
                key={
                  item.value
                }
                type="button"
                onClick={() => {
                  setProductType(
                    item.value,
                  );

                  setSelectedOptions(
                    [],
                  );

                  setSearchClassifications(
                    [],
                  );

                  setInstallationMethods(
                    [],
                  );

                  setLocType(
                    "",
                  );

                  setOptionsAreVariants(
                    false,
                  );

                  setVariantValues(
                    {},
                  );
                }}
                style={{
                  textAlign:
                    "left",

                  padding:
                    "13px",

                  borderRadius:
                    "11px",

                  cursor:
                    "pointer",

                  border:
                    productType ===
                    item.value
                      ? "2px solid #4B1678"
                      : "1px solid #ded3e5",

                  background:
                    productType ===
                    item.value
                      ? "#f7f0fb"
                      : "#ffffff",
                }}
              >
                <strong
                  style={{
                    color:
                      "#4B1678",
                  }}
                >
                  {
                    item.label
                  }
                </strong>

                <div
                  style={{
                    marginTop:
                      "4px",

                    fontSize:
                      "10px",

                    color:
                      "#7d7480",
                  }}
                >
                  {
                    item.description
                  }
                </div>
              </button>
            ),
          )}
        </div>
      </div>

      {productType && (
        <>
          {/* MATERIAL + COLOR */}

          <div
            style={
              sectionStyle
            }
          >
            <h2
              style={
                headingStyle
              }
            >
              Material & Color
            </h2>

            <div
              style={
                gridTwo
              }
            >
              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  {categoryMaterialLabel(productType)}{productType !== "HAIR_ESSENTIAL" ? " *" : ""}
                </label>

                <select
                  value={
                    material
                  }
                  onChange={(
                    event,
                  ) =>
                    setMaterial(
                      event
                        .target
                        .value,
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="">
                    Select material
                  </option>

                  {materials.map(
                    (
                      item,
                    ) => (
                      <option
                        key={
                          item
                        }
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>

                {material ===
                  "Other" && (
                  <input
                    value={
                      customMaterial
                    }
                    onChange={(
                      event,
                    ) =>
                      setCustomMaterial(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Type material"
                    style={{
                      ...fieldStyle,
                      marginTop:
                        "8px",
                    }}
                  />
                )}
                <div
                  style={{
                    marginTop: "6px",
                    color: "#817787",
                    fontSize: "10px",
                    lineHeight: "1.4",
                  }}
                >
                  Saved to Shopify as Hair Type (and Material). Human Hair also tags as 100% Human Hair.
                </div>
              </div>

              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  Color *
                </label>

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      "7px",

                    alignItems:
                      "flex-start",
                  }}
                >
                  <select
                    value={
                      color
                    }
                    onChange={(
                      event,
                    ) =>
                      setColor(
                        event
                          .target
                          .value,
                      )
                    }
                    style={
                      fieldStyle
                    }
                  >
                    {colors.map(
                      (
                        item,
                      ) => (
                        <option
                          key={
                            item
                          }
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={
                      addSelectedColor
                    }
                    style={{
                      ...secondaryButton,

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    + Add Color
                  </button>
                </div>

                {color ===
                  "Other / Custom" && (
                  <input
                    value={
                      customColor
                    }
                    onChange={(
                      event,
                    ) =>
                      setCustomColor(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Example: Champagne Blonde"
                    style={{
                      ...fieldStyle,
                      marginTop:
                        "8px",
                    }}
                  />
                )}

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      "7px",

                    flexWrap:
                      "wrap",

                    marginTop:
                      "9px",
                  }}
                >
                  {selectedColors.map(
                    (
                      colorValue,
                    ) => (
                      <button
                        key={
                          colorValue
                        }
                        type="button"
                        onClick={() =>
                          removeSelectedColor(
                            colorValue,
                          )
                        }
                        title={
                          selectedColors.length >
                          1
                            ? "Remove color"
                            : "At least one color is required"
                        }
                        style={{
                          border:
                            "1px solid #4B1678",

                          background:
                            "#f7f0fb",

                          color:
                            "#4B1678",

                          borderRadius:
                            "20px",

                          padding:
                            "6px 9px",

                          fontWeight:
                            "800",

                          fontSize:
                            "11px",

                          cursor:
                            selectedColors.length >
                            1
                              ? "pointer"
                              : "default",
                        }}
                      >
                        ✓ {colorValue}
                        {selectedColors.length >
                        1
                          ? " ×"
                          : ""}
                      </button>
                    ),
                  )}
                </div>

                {selectedColors.length >
                  1 && (
                  <div
                    style={{
                      marginTop:
                        "6px",

                      color:
                        "#817787",

                      fontSize:
                        "10px",
                    }}
                  >
                    Multiple colors will create separate Shopify variants.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* OPTIONS */}

          <div
            style={
              sectionStyle
            }
          >
            <h2
              style={
                headingStyle
              }
            >
              Product Options
            </h2>

            <div
              style={{
                color:
                  "#7d7480",

                fontSize:
                  "10px",

                lineHeight:
                  1.5,

                marginTop:
                  "-7px",

                marginBottom:
                  "12px",
              }}
            >
              Select every option that applies. Wig construction such as Glueless, Closure Wig, and Full Lace is chosen under Cap Type below, not here.
            </div>

            {currentOptions.length > 0 && (
            <div
              style={{
                display:
                  "flex",

                flexWrap:
                  "wrap",

                gap:
                  "8px",
              }}
            >
              {currentOptions.map(
                (
                  item,
                ) => (
                  <ChoiceButton
                    key={
                      item.value
                    }
                    label={
                      item.label
                    }
                    selected={
                      selectedOptions.includes(
                        item.value,
                      )
                    }
                    onClick={() =>
                      setSelectedOptions(
                        (current) => {
                          if (
                            productType ===
                              "BUNDLE" &&
                            item.value ===
                              "BUNDLE_DEAL"
                          ) {
                            return current.includes(
                              "BUNDLE_DEAL",
                            )
                              ? []
                              : [
                                  "BUNDLE_DEAL",
                                ];
                          }

                          if (
                            productType ===
                              "BUNDLE" &&
                            current.includes(
                              "BUNDLE_DEAL",
                            )
                          ) {
                            return [
                              item.value,
                            ];
                          }

                          return toggleValue(
                            current,
                            item.value,
                          );
                        },
                      )
                    }
                  />
                ),
              )}
            </div>
            )}

            {currentClassifications.length >
              0 && (
              <div
                style={{
                  marginTop:
                    "18px",

                  paddingTop:
                    "16px",

                  borderTop:
                    "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color:
                      "#4B1678",

                    fontSize:
                      "13px",

                    fontWeight:
                      "800",

                    marginBottom:
                      "5px",
                  }}
                >
                  Search & Product Classification
                </div>

                <div
                  style={{
                    color:
                      "#7d7480",

                    fontSize:
                      "10px",

                    lineHeight:
                      1.5,

                    marginBottom:
                      "10px",
                  }}
                >
                  Optional. Choose Locs only when this product is a loc product. It stays one product and does not create extra variants.
                </div>

                <div
                  style={{
                    display:
                      "flex",

                    flexWrap:
                      "wrap",

                    gap:
                      "8px",
                  }}
                >
                  {currentClassifications.map(
                    (
                      item,
                    ) => (
                      <ChoiceButton
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        selected={
                          searchClassifications.includes(
                            item.value,
                          )
                        }
                        onClick={() =>
                          setSearchClassifications(
                            (
                              current,
                            ) =>
                              toggleValue(
                                current,
                                item.value,
                              ),
                          )
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            )}


            {productType === "BRAIDING_HAIR" &&
              searchClassifications.includes("LOCS") && (
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "16px",
                  borderTop: "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color: "#4B1678",
                    fontSize: "13px",
                    fontWeight: "800",
                    marginBottom: "5px",
                  }}
                >
                  Loc Type
                </div>

                <div
                  style={{
                    color: "#7d7480",
                    fontSize: "10px",
                    lineHeight: 1.5,
                    marginBottom: "10px",
                  }}
                >
                  Tap the closest style. One tap only — this helps shoppers search for the exact loc style without creating another product or variant.
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {locTypeChoices.map((item) => (
                    <ChoiceButton
                      key={item.value}
                      label={item.label}
                      selected={locType === item.value}
                      onClick={() =>
                        setLocType(
                          locType === item.value
                            ? ""
                            : item.value,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}


            {productType ===
              "BRAIDING_HAIR" && (
              <div
                style={{
                  marginTop:
                    "18px",

                  paddingTop:
                    "16px",

                  borderTop:
                    "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color:
                      "#4B1678",

                    fontSize:
                      "13px",

                    fontWeight:
                      "800",

                    marginBottom:
                      "5px",
                  }}
                >
                  Installation
                </div>

                <div
                  style={{
                    color:
                      "#7d7480",

                    fontSize:
                      "10px",

                    lineHeight:
                      1.5,

                    marginBottom:
                      "10px",
                  }}
                >
                  Optional. Tap Crochet or Pre-Looped only when it applies. These help shoppers find the product and never create extra variants.
                </div>

                <div
                  style={{
                    display:
                      "flex",

                    flexWrap:
                      "wrap",

                    gap:
                      "8px",
                  }}
                >
                  {installationMethodChoices.map(
                    (item) => (
                      <ChoiceButton
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        selected={
                          installationMethods.includes(
                            item.value,
                          )
                        }
                        onClick={() =>
                          setInstallationMethods(
                            (current) =>
                              toggleValue(
                                current,
                                item.value,
                              ),
                          )
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            )}


            {selectedOptions.length >
              1 && (
              <div
                style={{
                  display:
                    "block",

                  marginTop:
                    "15px",

                  padding:
                    "12px",

                  background:
                    "#f2eafa",

                  border:
                    "1px solid #e2d1ef",

                  borderRadius:
                    "10px",

                  color:
                    "#4B1678",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",
                }}
              >
                ✓ Separate variant pricing is on for the options you selected.
              </div>
            )}
          </div>
        </>
      )}

      {/* HAIR DETAILS */}

      {isHair && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Hair Details
          </h2>

          <div
            style={{
              color:
                "#7d7480",

              fontSize:
                "10px",

              lineHeight:
                1.5,

              marginTop:
                "-7px",

              marginBottom:
                "13px",
            }}
          >
            Complete every detail that applies. Texture, length, lace, density and other attributes help your product appear when shoppers narrow or search the HairGrab catalog.
          </div>

          <label
            style={
              labelStyle
            }
          >
            Texture
          </label>

          <select
            value={
              texture
            }
            onChange={(
              event,
            ) =>
              setTexture(
                event.target
                  .value,
              )
            }
            style={{
              ...fieldStyle,
              maxWidth:
                "420px",
            }}
          >
            <option value="">
              Select texture
            </option>

            {textures.map(
              (
                item,
              ) => (
                <option
                  key={
                    item
                  }
                >
                  {item}
                </option>
              ),
            )}
          </select>

          <div
            style={{
              marginTop:
                "18px",
            }}
          >
            <label
              style={
                labelStyle
              }
            >
              Available Lengths
            </label>

            <div
              style={{
                display:
                  "flex",

                gap:
                  "7px",

                flexWrap:
                  "wrap",
              }}
            >
              {allLengths.map(
                (
                  length,
                ) => (
                  <button
                    key={
                      length
                    }
                    type="button"
                    onClick={() => {
                      if (edit) {
                        const removing = selectedLengths.includes(length);
                        const ids = edit.shopifySnapshot.variants.filter((variant) => variant.selectedOptions.some((option) =>
                          option.name.toLowerCase() === "length" && option.value.replace(/\D/g, "") === length)).map((variant) => variant.id);
                        setRemovedVariantIds((current) => removing
                          ? [...new Set([...current, ...ids])]
                          : current.filter((id) => !ids.includes(id)));
                      }
                      setSelectedLengths((current) => toggleValue(current, length));
                    }}
                    style={{
                      padding:
                        "8px 10px",

                      borderRadius:
                        "8px",

                      fontWeight:
                        "800",

                      cursor:
                        "pointer",

                      color:
                        "#4B1678",

                      border:
                        selectedLengths.includes(
                          length,
                        )
                          ? "2px solid #4B1678"
                          : "1px solid #d8cce0",

                      background:
                        selectedLengths.includes(
                          length,
                        )
                          ? "#f7f0fb"
                          : "#fff",
                    }}
                  >
                    {length}"
                  </button>
                ),
              )}
            </div>

            <div
              style={{
                display:
                  "flex",

                gap:
                  "8px",

                marginTop:
                  "10px",

                flexWrap:
                  "wrap",
              }}
            >
              <input
                value={
                  customLength
                }
                onChange={(
                  event,
                ) =>
                  setCustomLength(
                    event.target
                      .value,
                  )
                }
                placeholder="Other length, e.g. 42"
                style={{
                  ...fieldStyle,
                  maxWidth:
                    "220px",
                }}
              />

              <button
                type="button"
                onClick={
                  addCustomLength
                }
                style={
                  secondaryButton
                }
              >
                + Add Other Length
              </button>
            </div>
          </div>

          {productType && (categoryShowsAttribute(productType, "density") ||
            categoryShowsAttribute(productType, "laceSize") ||
            categoryShowsAttribute(productType, "laceType") ||
            productType === "WIG" ||
            productType === "CLOSURE_FRONTAL" ||
            categoryShowsAttribute(productType, "capSize") ||
            categoryShowsAttribute(productType, "weight") ||
            categoryShowsAttribute(productType, "origin") ||
            categoryShowsAttribute(productType, "weftType")) && (
            <div
              style={{
                ...gridTwo,
                marginTop: "18px",
              }}
            >
              {categoryShowsAttribute(productType, "density") && (
                <AttributeChipGroup
                  label="Density"
                  values={densities}
                  selected={selectedDensities}
                  onToggle={(item) => setSelectedDensities((current) => toggleValue(current, item))}
                />
              )}
              {(productType === "WIG" || productType === "CLOSURE_FRONTAL" || categoryShowsAttribute(productType, "laceSize")) && (
                <AttributeChipGroup
                  label="Lace Size"
                  values={laceSizes}
                  selected={selectedLaceSizes}
                  onToggle={(item) => setSelectedLaceSizes((current) => toggleValue(current, item))}
                />
              )}
              {(productType === "WIG" || productType === "CLOSURE_FRONTAL" || categoryShowsAttribute(productType, "laceType")) && (
                <AttributeChipGroup
                  label="Lace Type"
                  values={laceTypes}
                  selected={selectedLaceTypes}
                  onToggle={(item) => setSelectedLaceTypes((current) => toggleValue(current, item))}
                />
              )}
              {categoryShowsAttribute(productType, "capSize") && (
                <SimpleSelect
                  label="Cap Size"
                  value={capSize}
                  values={[...CAP_SIZE_VALUES]}
                  onChange={setCapSize}
                />
              )}
              {categoryShowsAttribute(productType, "capType") && (
                <AttributeChipGroup
                  label="Cap Type"
                  values={[...CAP_TYPE_VALUES]}
                  selected={selectedCapTypes}
                  onToggle={(item) => setSelectedCapTypes((current) => toggleValue(current, item))}
                />
              )}
              {categoryShowsAttribute(productType, "weight") && (
                <SimpleSelect
                  label={productType === "BUNDLE" ? "Bundle Weight" : "Weight"}
                  value={bundleWeight}
                  values={bundleWeights}
                  onChange={setBundleWeight}
                />
              )}
              {categoryShowsAttribute(productType, "origin") && (
                <SimpleSelect
                  label="Origin"
                  value={origin}
                  values={hairOrigins}
                  onChange={setOrigin}
                />
              )}
              {categoryShowsAttribute(productType, "weftType") && (
                <SimpleSelect
                  label="Weft Type"
                  value={weftType}
                  values={weftTypes}
                  onChange={(value) => {
                    setWeftType(value);
                    setSelectedOptions((current) => {
                      const rest = current.filter((item) => item !== "WEFT" && item !== "NO_WEFT");
                      if (value === "No Weft") return [...rest, "NO_WEFT"];
                      if (value) return [...rest, "WEFT"];
                      return rest;
                    });
                  }}
                />
              )}
            </div>
          )}

          {productType ===
            "EXTENSION" &&
            selectedOptions.includes(
              "CLIP_IN",
            ) && (
            <div
              style={{
                marginTop:
                  "18px",

                maxWidth:
                  "220px",
              }}
            >
              {/* Safety-review fix: no fixed choice list -- a "1".."5+"
                  dropdown would collapse a real 7-piece set into a lossy
                  bucket. HairGrab already sells 7-piece sets. */}
              <label style={labelStyle}>Piece Count</label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 7"
                value={pieceCount}
                onChange={(event) => setPieceCount(event.target.value.replace(/[^0-9]/g, ""))}
                style={fieldStyle}
              />
            </div>
          )}
        </div>
      )}

      {/* VARIANTS */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Price & Inventory
          </h2>

          {isHair &&
            selectedLengths.length ===
              0 && (
              <div
                style={{
                  padding:
                    "11px",

                  background:
                    "#fff9e9",

                  borderRadius:
                    "9px",

                  color:
                    "#755f1d",

                  fontSize:
                    "11px",
                }}
              >
                Select at least
                one length above.
              </div>
            )}

          {isBundleDeal &&
            selectedLengths.length > 0 && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "12px",
                  border: "1px solid #e2d1ef",
                  borderRadius: "10px",
                  background: "#f7f0fb",
                  color: "#4B1678",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  fontWeight: 700,
                }}
              >
                Bundle Deal pricing is one price for the complete set: {selectedLengths.map((length) => `${length}"`).join(" + ")}. Enter the full deal price below.
              </div>
            )}

          {variantRows.length >
            0 && (
            <>
              <div
                style={{
                  marginBottom:
                    "14px",

                  padding:
                    "13px",

                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "10px",

                  background:
                    onSale
                      ? "#fff8e8"
                      : "#fcf9fe",
                }}
              >
                <label
                  style={{
                    display:
                      "flex",

                    gap:
                      "9px",

                    alignItems:
                      "flex-start",

                    cursor:
                      "pointer",

                    color:
                      "#4B1678",

                    fontWeight:
                      "800",

                    fontSize:
                      "12px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      onSale
                    }
                    onChange={(
                      event,
                    ) =>
                      setOnSale(
                        event.target
                          .checked,
                      )
                    }
                    style={{
                      width:
                        "17px",

                      height:
                        "17px",

                      accentColor:
                        "#4B1678",
                    }}
                  />

                  <span>
                    This product is on sale
                    <span
                      style={{
                        display:
                          "block",

                        marginTop:
                          "3px",

                        color:
                          "#756b79",

                        fontSize:
                          "10px",

                        fontWeight:
                          "400",

                        lineHeight:
                          1.45,
                      }}
                    >
                      Turn this on to enter a Sale Price for each variant. HairGrab will send the regular price and sale price to Shopify so the product can appear automatically in On Sale.
                    </span>
                  </span>
                </label>
              </div>

              <div
                style={{
                  overflowX:
                    "auto",
                }}
              >
                <table
                  style={{
                    width:
                      "100%",

                    minWidth:
                      onSale
                        ? "760px"
                        : "620px",

                    borderCollapse:
                      "collapse",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "#f7f0fb",
                      }}
                    >
                      <th
                        style={
                          thStyle
                        }
                      >
                        Variant
                      </th>

                      <th
                        style={
                          thStyle
                        }
                      >
                        {onSale
                          ? "Regular Price *"
                          : "Price *"}
                      </th>

                      {onSale && (
                        <th
                          style={
                            thStyle
                          }
                        >
                          Sale Price *
                        </th>
                      )}

                      <th
                        style={
                          thStyle
                        }
                      >
                        Inventory
                      </th>

                      <th
                        style={
                          thStyle
                        }
                      >
                        SKU
                      </th>
                      {edit && <th style={thStyle}>Remove</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {variantRows.map(
                      (
                        row,
                      ) => {
                        const data =
                          variantValues[
                            row.key
                          ] || {
                            price:
                              "",

                            salePrice:
                              "",

                            inventory:
                              "",

                            sku:
                              "",
                          };

                        return (
                          <tr
                            key={
                              row.key
                            }
                          >
                            <td
                              style={
                                tdStyle
                              }
                            >
                              {
                                row.label
                              }
                              {edit && !row.key.startsWith("NEW__") && !row.key.startsWith("MANUAL__") && row.shopifyOptions?.map((option, optionIndex) =>
                                <label key={option.name} style={{ display: "block", marginTop: 5, fontSize: 10 }}>{option.name}
                                  <input value={option.value} onChange={(event) => setOptionOverrides((current) => ({ ...current,
                                    [row.key]: (current[row.key] || row.shopifyOptions || []).map((item, index) =>
                                      index === optionIndex ? { ...item, value: event.target.value } : item) }))}
                                    style={{ ...fieldStyle, minWidth: 100 }} />
                                </label>)}
                            </td>

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={
                                  data.price
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "price",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                style={
                                  fieldStyle
                                }
                              />
                            </td>

                            {onSale && (
                              <td
                                style={
                                  tdStyle
                                }
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={
                                    data.salePrice
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setVariantField(
                                      row.key,
                                      "salePrice",
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                  placeholder="Sale price"
                                  style={
                                    fieldStyle
                                  }
                                />
                              </td>
                            )}

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                type="number"
                                value={
                                  data.inventory
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "inventory",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                style={
                                  fieldStyle
                                }
                              />
                            </td>

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                value={
                                  data.sku
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "sku",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                placeholder="Optional"
                                style={
                                  fieldStyle
                                }
                              />
                            </td>
                            {edit && <td style={tdStyle}><button type="button" onClick={() => {
                              if (row.key.startsWith("MANUAL__")) {
                                setManualCombinations((current) => current.filter((item) => item.key !== row.key));
                              } else if (row.key.startsWith("NEW__")) {
                                setSelectedLengths((current) => current.filter((length) => length !== row.length));
                              } else {
                                setRemovedVariantIds((current) => [...new Set([...current, row.key])]);
                              }
                            }}>Remove</button></td>}
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {edit && edit.shopifySnapshot.options.length > 0 && <div style={{ marginTop: 16, padding: 12, border: "1px solid #e2d5eb", borderRadius: 9 }}>
            <strong>Add a variant combination</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              {edit.shopifySnapshot.options.map((axis) => <label key={axis.id || axis.name} style={{ fontSize: 11 }}>
                {axis.name}<input list={`option-${axis.id || axis.name}`} value={newCombinationValues[axis.name] || ""}
                  onChange={(event) => setNewCombinationValues((current) => ({ ...current, [axis.name]: event.target.value }))}
                  style={{ ...fieldStyle, minWidth: 120 }} />
                <datalist id={`option-${axis.id || axis.name}`}>{axis.values.map((value) => <option key={value.id || value.name} value={value.name} />)}</datalist>
              </label>)}
            </div>
            <button type="button" style={{ ...secondaryButton, marginTop: 9 }} onClick={() => {
              if (edit.shopifySnapshot.options.some((axis) => !newCombinationValues[axis.name]?.trim())) return;
              setManualCombinations((current) => [...current, { key: `MANUAL__${crypto.randomUUID()}`,
                options: edit.shopifySnapshot.options.map((axis) => ({ name: axis.name, value: newCombinationValues[axis.name].trim() })) }]);
              setNewCombinationValues({});
            }}>Add Combination</button>
          </div>}
        </div>
      )}

      {/* SHIPPING & FULFILLMENT */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Shipping & Fulfillment
          </h2>

          <p
            style={{
              margin:
                "-5px 0 16px",

              color:
                "#776e7b",

              fontSize:
                "11px",

              lineHeight:
                "1.5",
            }}
          >
            Tell shoppers what they will pay for standard shipping and how quickly you normally hand the order to the carrier. HairGrab fills your seller city and state automatically.
          </p>

          <div
            style={{
              padding:
                "14px",

              border:
                "1px solid #e2d5eb",

              borderRadius:
                "11px",

              background:
                "#fcf9fe",

              marginBottom:
                "16px",
            }}
          >
            <div
              style={{
                fontWeight:
                  "800",

                color:
                  "#4B1678",

                fontSize:
                  "13px",

                marginBottom:
                  "10px",
              }}
            >
              Customer Shipping Charge *
            </div>

            <select
              value={
                shippingMethod
              }
              onChange={(
                event,
              ) => {
                const value =
                  event.target
                    .value;

                setShippingMethod(
                  value,
                );

                if (
                  value !==
                  "Flat Rate Shipping"
                ) {
                  setFlatRateShipping(
                    "",
                  );
                }
              }}
              style={
                fieldStyle
              }
            >

              {edit && shippingMethod !== "Free Shipping" && shippingMethod !== "Flat Rate Shipping" &&
                <option value={shippingMethod}>Current: {shippingMethod}</option>}

              <option value="Free Shipping">
                Free Shipping — Seller Covers Shipping Cost
              </option>

              <option value="Flat Rate Shipping">
                Flat Rate Shipping — You Set the Rate
              </option>
            </select>

            {shippingMethod ===
              "Free Shipping" && (
              <div
                style={{
                  marginTop:
                    "8px",

                  color:
                    "#6f6675",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.45",
                }}
              >
                The shopper pays $0 for standard shipping. You are responsible for the cost of the shipping label.
              </div>
            )}

            {shippingMethod ===
              "Flat Rate Shipping" && (
              <div
                style={{
                  marginTop:
                    "12px",

                  maxWidth:
                    "280px",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  Customer Shipping Charge *
                </label>

                <div
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    gap:
                      "7px",
                  }}
                >
                  <span
                    style={{
                      fontWeight:
                        "800",

                      color:
                        "#4B1678",
                    }}
                  >
                    $
                  </span>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={
                      flatRateShipping
                    }
                    onChange={(
                      event,
                    ) =>
                      setFlatRateShipping(
                        event.target
                          .value,
                      )
                    }
                    placeholder="7.99"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                <div
                  style={{
                    marginTop:
                      "7px",

                    color:
                      "#6f6675",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.45",
                  }}
                >
                  The shopper will be charged this amount for standard shipping. If the actual label costs more, you are responsible for the difference.
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",

              gap:
                "14px",
            }}
          >
            <div>
              <label
                style={
                  labelStyle
                }
              >
                Ships Within *
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                {shipsWithinChoices.map((choice) => (
                  <ChoiceButton
                    key={choice.value}
                    label={choice.label}
                    selected={selectedShipsWithin.includes(choice.value)}
                    onClick={() => {
                      setSelectedShipsWithin((current) => {
                        const next = toggleValue(current, choice.value);
                        if (next.some((item) => item.toLowerCase() === "same day")) setSameDayDelivery(true);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                This is your normal processing time before the package is handed to the carrier. Same-day courier delivery is a separate HairGrab feature.
              </div>
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Same-Day Delivery / Pickup
              </label>

              <select
                value={
                  sameDayDelivery
                    ? "Yes"
                    : "No"
                }
                onChange={(
                  event,
                ) =>
                  setSameDayDelivery(
                    event.target
                      .value ===
                      "Yes",
                  )
                }
                style={
                  fieldStyle
                }
              >
                <option value="No">
                  Not offered on this product
                </option>
                <option value="Yes">
                  Eligible for nearby same-day
                </option>
              </select>

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                Saved as a separate product flag. HairGrab can offer this only when a shopper is within about 10 miles, using Shipday. It does not replace the Ships Within timeline.
              </div>
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Return Policy *
              </label>

              <select
                value={
                  returnPolicy
                }
                onChange={(
                  event,
                ) =>
                  setReturnPolicy(
                    event.target
                      .value,
                  )
                }
                style={
                  fieldStyle
                }
              >
                <option value="14-Day Returns">
                  14-Day Returns
                </option>

                <option value="Final Sale">
                  Final Sale
                </option>
              </select>

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                Return policy is saved with the product, but it will not be shown on the HairGrab product card.
              </div>
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Show on HairGrab Map *
              </label>

              <select
                value={
                  showOnMap
                }
                onChange={(
                  event,
                ) =>
                  setShowOnMap(
                    event.target
                      .value,
                  )
                }
                style={
                  fieldStyle
                }
              >
                <option value="Yes">
                  Yes
                </option>

                <option value="No">
                  No
                </option>
              </select>

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                Yes makes this product eligible for HairGrab local/map discovery.
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                Ships From City
              </label>
              <input
                value={shipsFromCity}
                onChange={(event) => setShipsFromCity(event.target.value)}
                placeholder={seller.city || "City"}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Ships From State
              </label>
              <input
                value={shipsFromState}
                onChange={(event) => setShipsFromState(event.target.value)}
                placeholder={seller.state || "State"}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Shipping Territory
              </label>
              <select
                value={shippingTerritory}
                onChange={(event) => setShippingTerritory(event.target.value)}
                style={fieldStyle}
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Local">Local</option>
                {shippingTerritory && !["Nationwide", "Local"].includes(shippingTerritory) ? (
                  <option value={shippingTerritory}>{shippingTerritory}</option>
                ) : null}
              </select>
            </div>
          </div>

          <div
            style={{
              marginTop:
                "18px",

              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",

              gap:
                "12px",
            }}
          >
            {seller.offersLocalPickup ? (
              <div
                style={{
                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#ffffff",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    marginBottom:
                      "8px",
                  }}
                >
                  Local Pickup
                </label>

                <select
                  value={
                    localPickupAvailable
                      ? "Yes"
                      : "No"
                  }
                  onChange={(
                    event,
                  ) =>
                    setLocalPickupAvailable(
                      event.target
                        .value ===
                        "Yes",
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="No">
                    Not Available for This Product
                  </option>

                  <option value="Yes">
                    Local Pickup Available
                  </option>
                </select>

                <div
                  style={{
                    marginTop:
                      "6px",

                    color:
                      "#817787",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  Local pickup is enabled in your HairGrab store settings.
                </div>
              </div>
            ) : (
              <div
                style={{
                  border:
                    "1px dashed #d8cce0",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#faf8fb",
                }}
              >
                <div
                  style={{
                    fontWeight:
                      "800",

                    color:
                      "#6f6675",

                    fontSize:
                      "12px",
                  }}
                >
                  Local Pickup
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",

                    color:
                      "#8b828f",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  Not enabled for your store. You can turn on Local Pickup in Store Settings before offering it on products.
                </div>
              </div>
            )}

            {seller.offersLocalDelivery && (
              <div
                style={{
                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#ffffff",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    marginBottom:
                      "8px",
                  }}
                >
                  Seller-Managed Local Delivery
                </label>

                <select
                  value={
                    localDeliveryAvailable
                      ? "Yes"
                      : "No"
                  }
                  onChange={(
                    event,
                  ) =>
                    setLocalDeliveryAvailable(
                      event.target
                        .value ===
                        "Yes",
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="No">
                    Not Available for This Product
                  </option>

                  <option value="Yes">
                    Local Delivery Available
                  </option>
                </select>

                <div
                  style={{
                    marginTop:
                      "6px",

                    color:
                      "#817787",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  This is delivery you arrange yourself. It is separate from HairGrab Same-Day Delivery.
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop:
                "18px",

              padding:
                "16px",

              border:
                "1px solid #d7bfe8",

              borderRadius:
                "12px",

              background:
                "#f7f0fb",
            }}
          >
            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  "8px",

                fontWeight:
                  "900",

                color:
                  "#4B1678",

                fontSize:
                  "14px",
              }}
            >
              <span
                aria-hidden="true"
              >
                ⚡
              </span>
              HairGrab Same-Day Delivery — Coming Soon
            </div>

            <div
              style={{
                marginTop:
                  "8px",

                color:
                  "#5f5367",

                fontSize:
                  "11px",

                lineHeight:
                  "1.55",
              }}
            >
              HairGrab is working to bring DoorDash-style same-day delivery to participating areas. When available, a local delivery driver can pick up eligible orders from the seller and deliver them directly to nearby HairGrab shoppers.
            </div>

            <div
              style={{
                marginTop:
                  "7px",

                color:
                  "#4B1678",

                fontSize:
                  "10px",

                fontWeight:
                  "700",

                lineHeight:
                  "1.45",
              }}
            >
              No action is needed right now. Availability will vary by location, and HairGrab will notify eligible sellers when Same-Day Delivery becomes available in their area.
            </div>
          </div>
        </div>
      )}

      {/* MEDIA */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Photos & Videos
          </h2>

          <div
            style={{
              color:
                "#7d7480",
              fontSize:
                "10px",
              lineHeight:
                1.5,
              marginTop:
                "-7px",
              marginBottom:
                "12px",
            }}
          >
            Add your photos once, then arrange them visually. The first image becomes the HairGrab product-card image and the saved order is sent to Shopify.
          </div>

          <div
            style={
              gridTwo
            }
          >
            <UploadBox
              title="Product Photos"
              count={
                edit ? edit.shopifySnapshot.media.filter((item) => item.mediaContentType === "IMAGE" && !removedMediaIds.includes(item.id)).length + newMedia.filter((item) => item.kind === "IMAGE").length : images.length
              }
              max={10}
              accept="image/*"
              onChange={
                handleImages
              }
            />

            <UploadBox
              title="Product Videos"
              count={
                edit ? edit.shopifySnapshot.media.filter((item) => item.mediaContentType === "VIDEO" && !removedMediaIds.includes(item.id)).length + newMedia.filter((item) => item.kind === "VIDEO").length : videos.length
              }
              max={3}
              accept="video/*"
              onChange={
                handleVideos
              }
            />
          </div>

          {edit && <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {mediaOrder.map((id, index) => {
              const existing = edit.shopifySnapshot.media.find((item) => item.id === id);
              const fresh = newMedia.find((item) => item.key === id);
              if (removedMediaIds.includes(id) || (!existing && !fresh)) return null;
              return <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "1px solid #e2d5eb", borderRadius: 8 }}>
                {existing?.mediaContentType === "IMAGE" && existing.url && <img src={existing.url} alt={existing.alt || "Product image"} style={{ width: 55, height: 55, objectFit: "cover" }} />}
                {existing?.mediaContentType === "VIDEO" && existing.url && <video controls src={existing.url} style={{ width: 90, height: 55 }} />}
                {fresh?.kind === "IMAGE" && <img src={newMediaPreviewUrls.get(fresh.key)} alt={fresh.file.name} style={{ width: 55, height: 55, objectFit: "cover" }} />}
                {fresh?.kind === "VIDEO" && <video controls src={newMediaPreviewUrls.get(fresh.key)} style={{ width: 90, height: 55 }} />}
                <span style={{ flex: 1, overflowWrap: "anywhere" }}>{existing ? `${existing.mediaContentType}: ${existing.alt || existing.url || id}` : `${fresh?.kind}: ${fresh?.file.name}`}</span>
                <button type="button" disabled={index === 0} onClick={() => setMediaOrder((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>Up</button>
                <button type="button" disabled={index === mediaOrder.length - 1} onClick={() => setMediaOrder((current) => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>Down</button>
                <button type="button" onClick={() => { if (existing) setRemovedMediaIds((current) => [...current, id]); else setNewMedia((current) => current.filter((item) => item.key !== id)); setMediaOrder((current) => current.filter((key) => key !== id)); }}>Remove</button>
              </div>;
            })}
          </div>}

          {!edit && images.length >
            0 && (
            <ImageFileGrid
              files={
                images
              }
              onRemove={(
                index,
              ) =>
                setImages(
                  (current) =>
                    current.filter(
                      (_, i) =>
                        i !==
                        index,
                    ),
                )
              }
              onMove={(
                fromIndex,
                toIndex,
              ) =>
                setImages(
                  (current) => {
                    if (
                      fromIndex ===
                        toIndex ||
                      fromIndex < 0 ||
                      toIndex < 0 ||
                      fromIndex >=
                        current.length ||
                      toIndex >=
                        current.length
                    ) {
                      return current;
                    }

                    const next =
                      [...current];

                    const [moved] =
                      next.splice(
                        fromIndex,
                        1,
                      );

                    next.splice(
                      toIndex,
                      0,
                      moved,
                    );

                    return next;
                  },
                )
              }
            />
          )}

          {!edit && videos.length >
            0 && (
            <FileList
              title="Videos"
              files={
                videos
              }
              onRemove={(
                index,
              ) =>
                setVideos(
                  (
                    current,
                  ) =>
                    current.filter(
                      (
                        _,
                        i,
                      ) =>
                        i !==
                        index,
                    ),
                )
              }
            />
          )}
        </div>
      )}

      <div
        style={
          sectionStyle
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, .65fr) minmax(0, 1fr)",
            gap: "10px",
          }}
        >
          {!edit && <button
            type="button"
            disabled={
              saving ||
              !productType ||
              !title.trim()
            }
            onClick={() =>
              saveProduct(true)
            }
            style={{
              ...secondaryButton,
              opacity:
                !productType ||
                !title.trim()
                  ? 0.45
                  : 1,
              cursor:
                !productType ||
                !title.trim()
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving
              ? "Saving..."
              : "Save Draft"}
          </button>}

          <button
          type="button"
          disabled={
            edit ? saving || !title.trim() : !ready
          }
          onClick={() => edit ? saveProduct(false) : setReviewing(true)}
          style={{
            ...primaryButton,

            width:
              "100%",

            opacity:
              (edit ? Boolean(title.trim()) : ready)
                ? 1
                : 0.45,

            cursor:
              (edit ? Boolean(title.trim()) : ready)
                ? "pointer"
                : "not-allowed",
          }}
        >
          {edit ? (saving ? "Saving…" : saveResult?.success && !editDirty ? "✓ Saved" : "Save Changes") : "Review Product"}
        </button>
        </div>

        {saveResult?.message && (
          <PostSaveSellerActions
            message={saveResult.message}
            success={Boolean(saveResult.success)}
            storeViewHref={productStoreViewHref({
              handle:
                saveResult.productHandle ||
                edit?.product.handle,
              storeSlug: seller.storeSlug,
              storefrontPublished: seller.storefrontPublished,
            })}
          />
        )}

        {!edit && !ready &&
          missingRequirements.length >
            0 && (
            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "10px 12px",
                borderRadius:
                  "8px",
                background:
                  "#fdf3d9",
                color:
                  "#6f5516",
                fontSize:
                  "11px",
                fontWeight:
                  "700",
              }}
            >
              Before you can review this product, finish: {missingRequirements.join(
                ", ",
              )}
              .
            </div>
          )}
      </div>
      </>)}
    </PageShell>
  );
}


// ==========================================================
// UI HELPERS
// ==========================================================

const gridTwo = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",

  gap:
    "14px",
};

const primaryButton = {
  border:
    "none",

  background:
    "#4B1678",

  color:
    "#ffffff",

  borderRadius:
    "9px",

  padding:
    "11px 15px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const secondaryButton = {
  border:
    "1px solid #4B1678",

  background:
    "#ffffff",

  color:
    "#4B1678",

  borderRadius:
    "9px",

  padding:
    "11px 15px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

function productStoreViewHref({
  handle,
  storeSlug,
  storefrontPublished,
}: {
  handle?: string | null;
  storeSlug?: string | null;
  storefrontPublished?: boolean;
}) {
  if (handle) {
    return `https://hairgrab.com/products/${handle}`;
  }

  if (storeSlug && storefrontPublished) {
    return `https://shops.hairgrab.com/seller-store/${storeSlug}`;
  }

  return "/seller/store-preview";
}

const postSaveNavButton = {
  ...secondaryButton,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
} as const;

function PostSaveSellerActions({
  message,
  success,
  extra,
  storeViewHref,
  bannerRef,
}: {
  message: string;
  success: boolean;
  extra?: ReactNode;
  storeViewHref: string;
  bannerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={bannerRef} style={{ marginTop: "12px", width: "100%" }}>
      <div
        role="status"
        style={{
          padding: "14px",
          borderRadius: "10px",
          background: success ? "#eef8f0" : "#fff1f1",
          color: success ? "#2f6b3c" : "#922f2f",
          fontWeight: 800,
          fontSize: "12px",
        }}
      >
        {message}
        {extra}
      </div>

      {success && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "10px",
          }}
        >
          <a
            href="/seller/add-product"
            style={{
              ...primaryButton,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Add Another Product
          </a>
          <a
            href={storeViewHref}
            target="_blank"
            rel="noreferrer"
            style={postSaveNavButton}
          >
            Store View
          </a>
          <a href="/seller/products" style={postSaveNavButton}>
            Back to Products
          </a>
          <a href="/seller/dashboard" style={postSaveNavButton}>
            Back to Dashboard
          </a>
        </div>
      )}
    </div>
  );
}

function PageShell({
  children,
  onChange,
}: {
  children: React.ReactNode;
  onChange?: () => void;
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

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "920px",

          margin:
            "0 auto",
        }}
      >
        <div
          style={{
            marginBottom:
              "12px",
          }}
        >
          <a
            href="/seller"
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
          </a>
        </div>

        <div
          style={{
            textAlign:
              "center",

            marginBottom:
              "18px",
          }}
        >
          <img
            src="/hairgrab-logo.png"
            alt="HairGrab"
            style={{
              width:
                "235px",

              maxWidth:
                "70%",
            }}
          />
        </div>

        <div
          onChange={onChange}
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e6d9ef",

            borderRadius:
              "18px",

            padding:
              "26px",

            boxShadow:
              "0 4px 18px rgba(75,22,120,.07)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SimpleSelect({
  label,
  value,
  values,
  onChange,
}: {
  label:
    string;

  value:
    string;

  values:
    string[];

  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}
      </label>

      <select
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        style={
          fieldStyle
        }
      >
        <option value="">
          Select
        </option>

        {value && !values.includes(value) ? (
          <option key={value} value={value}>
            {value}
          </option>
        ) : null}

        {values.map(
          (
            item,
          ) => (
            <option
              key={
                item
              }
              value={item}
            >
              {item}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function QuickFill({
  label,
  value,
  onChange,
  onFill,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;

  onFill:
    () => void;
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}
      </label>

      <div
        style={{
          display:
            "flex",

          gap:
            "6px",
        }}
      >
        <input
          type="number"
          value={
            value
          }
          onChange={(
            event,
          ) =>
            onChange(
              event.target
                .value,
            )
          }
          style={
            fieldStyle
          }
        />

        <button
          type="button"
          onClick={
            onFill
          }
          style={
            secondaryButton
          }
        >
          Fill All
        </button>
      </div>
    </div>
  );
}

function UploadBox({
  title,
  count,
  max,
  accept,
  onChange,
}: {
  title:
    string;

  count:
    number;

  max:
    number;

  accept:
    string;

  onChange:
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ) => void;
}) {
  return (
    <div
      style={{
        border:
          "1px solid #ded3e5",

        borderRadius:
          "12px",

        padding:
          "15px",
      }}
    >
      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          marginBottom:
            "10px",
        }}
      >
        <strong
          style={{
            color:
              "#4B1678",
          }}
        >
          {title}
        </strong>

        <span>
          {count}/{max}
        </span>
      </div>

      <label
        style={{
          display:
            "block",

          border:
            "1px dashed #bdaac9",

          borderRadius:
            "9px",

          padding:
            "13px",

          textAlign:
            "center",

          color:
            "#4B1678",

          fontWeight:
            "800",

          cursor:
            "pointer",
        }}
      >
        + Add Files

        <input
          type="file"
          multiple
          accept={
            accept
          }
          onChange={
            onChange
          }
          style={{
            display:
              "none",
          }}
        />
      </label>
    </div>
  );
}

function ImageFileGrid({
  files,
  onRemove,
  onMove,
}: {
  files:
    File[];

  onRemove:
    (
      index:
        number,
    ) => void;

  onMove:
    (
      fromIndex:
        number,
      toIndex:
        number,
    ) => void;
}) {
  const [
    draggingIndex,
    setDraggingIndex,
  ] =
    useState<number | null>(
      null,
    );

  const previewUrls =
    useMemo(
      () =>
        files.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [files],
    );

  useEffect(
    () => () => {
      for (
        const url of
        previewUrls
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [previewUrls],
  );

  return (
    <div
      style={{
        marginTop:
          "14px",
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
            "baseline",
          flexWrap:
            "wrap",
          marginBottom:
            "9px",
        }}
      >
        <strong
          style={{
            color:
              "#4B1678",
          }}
        >
          Product Photos
        </strong>

        <span
          style={{
            color:
              "#7d7480",
            fontSize:
              "10px",
          }}
        >
          First photo = product card image. Drag to reorder or use the arrows.
        </span>
      </div>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(125px, 1fr))",
          gap:
            "10px",
        }}
      >
        {files.map(
          (
            file,
            index,
          ) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              draggable
              onDragStart={() =>
                setDraggingIndex(
                  index,
                )
              }
              onDragOver={(event) =>
                event.preventDefault()
              }
              onDrop={() => {
                if (
                  draggingIndex !==
                    null
                ) {
                  onMove(
                    draggingIndex,
                    index,
                  );
                }

                setDraggingIndex(
                  null,
                );
              }}
              onDragEnd={() =>
                setDraggingIndex(
                  null,
                )
              }
              style={{
                border:
                  index === 0
                    ? "2px solid #4B1678"
                    : "1px solid #ded3e5",
                borderRadius:
                  "11px",
                overflow:
                  "hidden",
                background:
                  "#ffffff",
                boxShadow:
                  "0 2px 8px rgba(75,22,120,0.06)",
              }}
            >
              <div
                style={{
                  position:
                    "relative",
                  aspectRatio:
                    "1 / 1",
                  background:
                    "#faf7fc",
                }}
              >
                <img
                  src={
                    previewUrls[index]
                  }
                  alt={
                    file.name
                  }
                  style={{
                    width:
                      "100%",
                    height:
                      "100%",
                    objectFit:
                      "cover",
                    display:
                      "block",
                  }}
                />

                {index ===
                  0 && (
                  <div
                    style={{
                      position:
                        "absolute",
                      left:
                        "7px",
                      top:
                        "7px",
                      background:
                        "#4B1678",
                      color:
                        "#ffffff",
                      borderRadius:
                        "999px",
                      padding:
                        "4px 7px",
                      fontSize:
                        "9px",
                      fontWeight:
                        "800",
                    }}
                  >
                    Primary
                  </div>
                )}
              </div>

              <div
                style={{
                  padding:
                    "8px",
                }}
              >
                <div
                  title={
                    file.name
                  }
                  style={{
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                    color:
                      "#35263e",
                    fontSize:
                      "10px",
                    marginBottom:
                      "7px",
                  }}
                >
                  {file.name}
                </div>

                {index > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onMove(
                        index,
                        0,
                      )
                    }
                    style={{
                      width:
                        "100%",
                      border:
                        "1px solid #d8cce0",
                      background:
                        "#f7f0fb",
                      color:
                        "#4B1678",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      fontSize:
                        "10px",
                      fontWeight:
                        "800",
                      cursor:
                        "pointer",
                      marginBottom:
                        "6px",
                    }}
                  >
                    Make Primary
                  </button>
                )}

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr 1fr 1fr",
                    gap:
                      "5px",
                  }}
                >
                  <button
                    type="button"
                    disabled={
                      index === 0
                    }
                    onClick={() =>
                      onMove(
                        index,
                        index - 1,
                      )
                    }
                    aria-label="Move photo left"
                    style={{
                      border:
                        "1px solid #ded3e5",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        index === 0
                          ? "default"
                          : "pointer",
                      opacity:
                        index === 0
                          ? 0.4
                          : 1,
                    }}
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    disabled={
                      index ===
                      files.length -
                        1
                    }
                    onClick={() =>
                      onMove(
                        index,
                        index + 1,
                      )
                    }
                    aria-label="Move photo right"
                    style={{
                      border:
                        "1px solid #ded3e5",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        index ===
                        files.length -
                          1
                          ? "default"
                          : "pointer",
                      opacity:
                        index ===
                        files.length -
                          1
                          ? 0.4
                          : 1,
                    }}
                  >
                    →
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onRemove(
                        index,
                      )
                    }
                    aria-label="Remove photo"
                    style={{
                      border:
                        "1px solid #ead9e0",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FileList({
  title,
  files,
  onRemove,
}: {
  title:
    string;

  files:
    File[];

  onRemove:
    (
      index:
        number,
    ) => void;
}) {
  const previewUrls =
    useMemo(
      () =>
        files.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [files],
    );

  useEffect(
    () => () => {
      for (
        const url of
        previewUrls
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [previewUrls],
  );

  return (
    <div
      style={{
        marginTop:
          "14px",
      }}
    >
      <strong
        style={{
          color:
            "#4B1678",
        }}
      >
        {title}
      </strong>

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",

          gap:
            "10px",

          marginTop:
            "8px",
        }}
      >
        {files.map(
          (
            file,
            index,
          ) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              style={{
                border:
                  "1px solid #e4d8eb",

                borderRadius:
                  "10px",

                overflow:
                  "hidden",

                background:
                  "#faf7fc",
              }}
            >
              <video
                src={
                  previewUrls[index]
                }
                controls
                preload="metadata"
                playsInline
                style={{
                  display:
                    "block",

                  width:
                    "100%",

                  aspectRatio:
                    "16 / 9",

                  objectFit:
                    "contain",

                  background:
                    "#140c18",
                }}
              />

              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  gap:
                    "8px",

                  padding:
                    "9px",
                }}
              >
                <div
                  style={{
                    minWidth:
                      0,
                  }}
                >
                  <div
                    style={{
                      color:
                        "#4B1678",

                      fontSize:
                        "10px",

                      fontWeight:
                        "800",

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      whiteSpace:
                        "nowrap",
                    }}
                    title={
                      file.name
                    }
                  >
                    {file.name}
                  </div>

                  <div
                    style={{
                      marginTop:
                        "2px",

                      color:
                        "#7d7480",

                      fontSize:
                        "9px",
                    }}
                  >
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                    {" · "}
                    Ready to upload
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onRemove(
                      index,
                    )
                  }
                  aria-label={`Remove ${file.name}`}
                  style={{
                    border:
                      "1px solid #dacbe2",

                    background:
                      "#ffffff",

                    color:
                      "#4B1678",

                    borderRadius:
                      "7px",

                    padding:
                      "6px 9px",

                    fontWeight:
                      "800",

                    cursor:
                      "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div
        style={{
          marginTop:
            "7px",

          color:
            "#6f6575",

          fontSize:
            "9px",

          lineHeight:
            1.45,
        }}
      >
        If the video plays here, HairGrab has the file selected and it will be included when you save the product.
      </div>
    </div>
  );
}


function ReviewMediaPreview({
  images,
  videos,
}: {
  images:
    File[];
  videos:
    File[];
}) {
  const imageUrls =
    useMemo(
      () =>
        images.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [images],
    );

  const videoUrls =
    useMemo(
      () =>
        videos.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [videos],
    );

  useEffect(
    () => () => {
      for (
        const url of
        [
          ...imageUrls,
          ...videoUrls,
        ]
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [
      imageUrls,
      videoUrls,
    ],
  );

  return (
    <div>
      {images.length > 0 && (
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(110px, 1fr))",

            gap:
              "8px",
          }}
        >
          {images.map(
            (
              file,
              index,
            ) => (
              <div
                key={`review-image-${file.name}-${index}`}
                style={{
                  border:
                    "1px solid #eadff0",

                  borderRadius:
                    "9px",

                  overflow:
                    "hidden",

                  background:
                    "#faf7fc",
                }}
              >
                <img
                  src={
                    imageUrls[index]
                  }
                  alt={
                    file.name
                  }
                  style={{
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "1 / 1",

                    objectFit:
                      "cover",
                  }}
                />
              </div>
            ),
          )}
        </div>
      )}

      {videos.length > 0 && (
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",

            gap:
              "10px",

            marginTop:
              images.length > 0
                ? "12px"
                : "0",
          }}
        >
          {videos.map(
            (
              file,
              index,
            ) => (
              <div
                key={`review-video-${file.name}-${index}`}
                style={{
                  border:
                    "1px solid #eadff0",

                  borderRadius:
                    "9px",

                  overflow:
                    "hidden",

                  background:
                    "#faf7fc",
                }}
              >
                <video
                  src={
                    videoUrls[index]
                  }
                  controls
                  preload="metadata"
                  playsInline
                  style={{
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "16 / 9",

                    objectFit:
                      "contain",

                    background:
                      "#140c18",
                  }}
                />

                <div
                  style={{
                    padding:
                      "7px 9px",

                    color:
                      "#4B1678",

                    fontSize:
                      "9px",

                    fontWeight:
                      "800",

                    overflow:
                      "hidden",

                    textOverflow:
                      "ellipsis",

                    whiteSpace:
                      "nowrap",
                  }}
                  title={
                    file.name
                  }
                >
                  {file.name}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ReviewGrid({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        display:
          "grid",

        gridTemplateColumns:
          "repeat(auto-fit, minmax(160px, 1fr))",

        gap:
          "14px",
      }}
    >
      {children}
    </div>
  );
}

function ReviewValue({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div>
      <div
        style={{
          color:
            "#817787",

          fontSize:
            "10px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight:
            "800",

          marginTop:
            "3px",
        }}
      >
        {value}
      </div>
    </div>
  );
}
