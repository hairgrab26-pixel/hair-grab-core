import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

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
};

type VariantData = {
  price: string;
  inventory: string;
  sku: string;
};

const productTypes: Array<{
  value: ProductType;
  label: string;
  description: string;
}> = [
  {
    value: "WIG",
    label: "Wig",
    description:
      "Glueless, lace, closure, frontal and other wigs.",
  },
  {
    value: "BUNDLE",
    label: "Bundles",
    description:
      "Single bundles, bundle deals and wefted hair.",
  },
  {
    value: "CLOSURE_FRONTAL",
    label: "Closure / Frontal",
    description:
      "Closures, frontals and 360 lace pieces.",
  },
  {
    value: "EXTENSION",
    label: "Extensions",
    description:
      "Clip-ins, tape-ins, I-tips, ponytails and halos.",
  },
  {
    value: "BRAIDING_HAIR",
    label: "Braiding Hair",
    description:
      "Human or synthetic hair for braids and protective styles.",
  },
  {
    value: "HAIR_ESSENTIAL",
    label: "Hair Essentials",
    description:
      "Hair care, tools and accessories.",
  },
];

const productOptions: Record<ProductType, Choice[]> = {
  WIG: [
    { value: "GLUELESS", label: "Glueless" },
    { value: "LACE", label: "Lace" },
    { value: "CLOSURE_WIG", label: "Closure Wig" },
    { value: "FRONTAL_WIG", label: "Frontal Wig" },
    { value: "FULL_LACE", label: "Full Lace" },
    { value: "HEADBAND", label: "Headband Wig" },
  ],

  BUNDLE: [
    { value: "SINGLE_BUNDLE", label: "Single Bundle" },
    { value: "BUNDLE_DEAL", label: "Bundle Deal" },
    { value: "WEFT", label: "Weft" },
    { value: "NO_WEFT", label: "No Weft" },
    { value: "WITH_CLOSURE", label: "Includes Closure" },
    { value: "WITH_FRONTAL", label: "Includes Frontal" },
  ],

  CLOSURE_FRONTAL: [
    { value: "CLOSURE", label: "Closure" },
    { value: "FRONTAL", label: "Frontal" },
    { value: "360_FRONTAL", label: "360 Frontal" },
  ],

  EXTENSION: [
    { value: "CLIP_IN", label: "Clip-Ins" },
    { value: "TAPE_IN", label: "Tape-Ins" },
    { value: "I_TIP", label: "I-Tips / Microlinks" },
    { value: "PONYTAIL", label: "Ponytail" },
    { value: "HALO", label: "Halo" },
  ],

  BRAIDING_HAIR: [
    { value: "PRE_STRETCHED", label: "Pre-Stretched" },
    { value: "BOHO", label: "Boho / Loose Curl" },
  ],

  HAIR_ESSENTIAL: [
    { value: "HAIR_CARE", label: "Hair Care" },
    { value: "TOOLS", label: "Tools" },
    { value: "ACCESSORIES", label: "Accessories" },
  ],
};

const materials = [
  "Human Hair",
  "Synthetic Hair",
  "Human / Synthetic Blend",
  "Other",
  "Not Applicable",
];

const colors = [
  "Natural / 1B",
  "1 - Jet Black",
  "2 - Dark Brown",
  "4 - Medium Brown",
  "27 - Honey Blonde",
  "30 - Auburn",
  "613 - Blonde",
  "99J - Burgundy",
  "Red",
  "Copper",
  "Pink",
  "Blue",
  "Purple",
  "Gray / Silver",
  "Mixed / Highlighted",
  "Other / Custom",
];

const textures = [
  "Straight",
  "Body Wave",
  "Loose Wave",
  "Deep Wave",
  "Water Wave",
  "Curly",
  "Deep Curly",
  "Kinky Curly",
  "Kinky Straight",
  "Coily",
  "Other",
];

const standardLengths = [
  "8",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "40",
];

const densities = [
  "130%",
  "150%",
  "180%",
  "200%",
  "250%",
];

const laceSizes = [
  "2x6",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "13x4",
  "13x6",
  "360",
  "Full Lace",
];

const laceTypes = [
  "HD Lace",
  "Transparent Lace",
  "Swiss Lace",
  "Regular Lace",
];

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d8cce0",
  borderRadius: "10px",
  padding: "11px 12px",
  background: "#ffffff",
  color: "#21152a",
  fontSize: "14px",
};

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  color: "#4B1678",
  fontSize: "13px",
  fontWeight: "800",
};

const sectionStyle = {
  marginTop: "25px",
  paddingTop: "23px",
  borderTop: "1px solid #eee7f2",
};

function toggleValue(
  current: string[],
  value: string,
) {
  return current.includes(value)
    ? current.filter(
        (item) => item !== value,
      )
    : [...current, value];
}

function money(value: string) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "$0.00";
  }

  return number.toLocaleString(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    },
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: selected
          ? "2px solid #4B1678"
          : "1px solid #d8cce0",
        background: selected
          ? "#f7f0fb"
          : "#ffffff",
        color: "#4B1678",
        borderRadius: "9px",
        padding: "9px 12px",
        fontWeight: "800",
        fontSize: "12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "7px",
      }}
    >
      <span
        style={{
          width: "16px",
          height: "16px",
          minWidth: "16px",
          borderRadius: "4px",
          background: selected
            ? "#4B1678"
            : "#ffffff",
          border: selected
            ? "1px solid #4B1678"
            : "1px solid #b8acbf",
          color: "#ffffff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "10px",
        }}
      >
        {selected ? "✓" : ""}
      </span>

      {label}
    </button>
  );
}

export default function SellerAddProductPage() {
  const [reviewing, setReviewing] =
    useState(false);

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [productType, setProductType] =
    useState<ProductType | null>(null);

  const [
    selectedOptions,
    setSelectedOptions,
  ] = useState<string[]>([]);

  const [
    optionsAreVariants,
    setOptionsAreVariants,
  ] = useState(false);

  const [material, setMaterial] =
    useState("");

  const [
    customMaterial,
    setCustomMaterial,
  ] = useState("");

  const [color, setColor] =
    useState("Natural / 1B");

  const [
    customColor,
    setCustomColor,
  ] = useState("");

  const [texture, setTexture] =
    useState("");

  const [
    selectedLengths,
    setSelectedLengths,
  ] = useState<string[]>([]);

  const [
    customLength,
    setCustomLength,
  ] = useState("");

  const [
    customLengths,
    setCustomLengths,
  ] = useState<string[]>([]);

  const [density, setDensity] =
    useState("");

  const [laceSize, setLaceSize] =
    useState("");

  const [laceType, setLaceType] =
    useState("");

  const [capSize, setCapSize] =
    useState("");

  const [
    bundleWeight,
    setBundleWeight,
  ] = useState("100g");

  const [
    startingPrice,
    setStartingPrice,
  ] = useState("");

  const [
    priceIncrease,
    setPriceIncrease,
  ] = useState("");

  const [
    quickPrice,
    setQuickPrice,
  ] = useState("");

  const [
    quickInventory,
    setQuickInventory,
  ] = useState("");

  const [
    variantValues,
    setVariantValues,
  ] = useState<
    Record<string, VariantData>
  >({});

  const [images, setImages] =
    useState<File[]>([]);

  const [videos, setVideos] =
    useState<File[]>([]);

  const [
    mediaMessage,
    setMediaMessage,
  ] = useState("");

  const isHair =
    productType !== null &&
    productType !==
      "HAIR_ESSENTIAL";

  const currentOptions =
    productType
      ? productOptions[
          productType
        ]
      : [];

  const productTypeLabel =
    productTypes.find(
      (item) =>
        item.value ===
        productType,
    )?.label || "";

  const optionLabel = (
    value: string,
  ) =>
    currentOptions.find(
      (item) =>
        item.value ===
        value,
    )?.label || value;

  const allLengths =
    useMemo(
      () => [
        ...standardLengths,
        ...customLengths,
      ],
      [customLengths],
    );

  const resolvedMaterial =
    material === "Other"
      ? customMaterial.trim()
      : material;

  const resolvedColor =
    color ===
    "Other / Custom"
      ? customColor.trim()
      : color;

  const variantRows =
    useMemo<VariantRow[]>(
      () => {
        if (!productType) {
          return [];
        }

        if (
          productType ===
          "HAIR_ESSENTIAL"
        ) {
          return [
            {
              key: "DEFAULT",
              label: "Standard",
              length: "",
              option: "",
            },
          ];
        }

        const lengths =
          selectedLengths.length >
          0
            ? selectedLengths
            : [];

        if (
          lengths.length === 0
        ) {
          return [];
        }

        const optionVariants =
          optionsAreVariants &&
          selectedOptions.length >
            0
            ? selectedOptions
            : [""];

        const rows: VariantRow[] =
          [];

        for (
          const length of lengths
        ) {
          for (
            const option of
            optionVariants
          ) {
            const labels: string[] =
              [`${length}"`];

            if (option) {
              labels.push(
                optionLabel(
                  option,
                ),
              );
            }

            rows.push({
              key: `${length}__${
                option ||
                "NO_OPTION"
              }`,
              length,
              option,
              label:
                labels.join(
                  " / ",
                ),
            });
          }
        }

        return rows;
      },
      [
        productType,
        selectedLengths,
        optionsAreVariants,
        selectedOptions,
        currentOptions,
      ],
    );

  const changeProductType = (
    type: ProductType,
  ) => {
    setProductType(type);
    setSelectedOptions([]);
    setOptionsAreVariants(
      false,
    );
    setVariantValues({});
  };

  const addCustomLength =
    () => {
      const cleaned =
        customLength
          .replace(
            /[^0-9.]/g,
            "",
          )
          .trim();

      if (!cleaned) {
        return;
      }

      if (
        !customLengths.includes(
          cleaned,
        )
      ) {
        setCustomLengths(
          (current) => [
            ...current,
            cleaned,
          ],
        );
      }

      if (
        !selectedLengths.includes(
          cleaned,
        )
      ) {
        setSelectedLengths(
          (current) => [
            ...current,
            cleaned,
          ],
        );
      }

      setCustomLength("");
    };

  const removeCustomLength = (
    value: string,
  ) => {
    setCustomLengths(
      (current) =>
        current.filter(
          (item) =>
            item !== value,
        ),
    );

    setSelectedLengths(
      (current) =>
        current.filter(
          (item) =>
            item !== value,
        ),
    );
  };

  const setVariantField = (
    key: string,
    field:
      | "price"
      | "inventory"
      | "sku",
    value: string,
  ) => {
    setVariantValues(
      (current) => ({
        ...current,

        [key]: {
          price:
            current[key]
              ?.price || "",
          inventory:
            current[key]
              ?.inventory || "",
          sku:
            current[key]
              ?.sku || "",
          [field]: value,
        },
      }),
    );
  };

  const fillAllPrices =
    () => {
      if (!quickPrice) {
        return;
      }

      setVariantValues(
        (current) => {
          const next = {
            ...current,
          };

          for (
            const row of
            variantRows
          ) {
            next[row.key] = {
              price: quickPrice,
              inventory:
                next[row.key]
                  ?.inventory ||
                "",
              sku:
                next[row.key]
                  ?.sku || "",
            };
          }

          return next;
        },
      );
    };

  const fillAllInventory =
    () => {
      if (!quickInventory) {
        return;
      }

      setVariantValues(
        (current) => {
          const next = {
            ...current,
          };

          for (
            const row of
            variantRows
          ) {
            next[row.key] = {
              price:
                next[row.key]
                  ?.price || "",
              inventory:
                quickInventory,
              sku:
                next[row.key]
                  ?.sku || "",
            };
          }

          return next;
        },
      );
    };

  const autoPriceByLength =
    () => {
      const base =
        Number(
          startingPrice,
        );

      const increase =
        Number(
          priceIncrease || "0",
        );

      if (
        !Number.isFinite(base) ||
        base < 0
      ) {
        return;
      }

      const uniqueLengths =
        Array.from(
          new Set(
            variantRows.map(
              (row) =>
                row.length,
            ),
          ),
        ).sort(
          (a, b) =>
            Number(a) -
            Number(b),
        );

      setVariantValues(
        (current) => {
          const next = {
            ...current,
          };

          variantRows.forEach(
            (row) => {
              const lengthIndex =
                uniqueLengths.indexOf(
                  row.length,
                );

              const calculated =
                base +
                Math.max(
                  lengthIndex,
                  0,
                ) *
                  (Number.isFinite(
                    increase,
                  )
                    ? increase
                    : 0);

              next[row.key] = {
                price:
                  calculated.toFixed(
                    2,
                  ),
                inventory:
                  next[row.key]
                    ?.inventory ||
                  "",
                sku:
                  next[row.key]
                    ?.sku || "",
              };
            },
          );

          return next;
        },
      );
    };

  const handleImages = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles =
      Array.from(
        event.target
          .files || [],
      );

    const remaining =
      10 -
      images.length;

    if (
      remaining <= 0
    ) {
      setMediaMessage(
        "This product already has 10 images.",
      );
      return;
    }

    const accepted =
      selectedFiles.slice(
        0,
        remaining,
      );

    setImages(
      (current) => [
        ...current,
        ...accepted,
      ],
    );

    if (
      selectedFiles.length >
      remaining
    ) {
      setMediaMessage(
        "HairGrab allows a maximum of 10 product images.",
      );
    } else {
      setMediaMessage("");
    }

    event.target.value =
      "";
  };

  const handleVideos = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles =
      Array.from(
        event.target
          .files || [],
      );

    const remaining =
      3 -
      videos.length;

    if (
      remaining <= 0
    ) {
      setMediaMessage(
        "This product already has 3 videos.",
      );
      return;
    }

    const accepted =
      selectedFiles.slice(
        0,
        remaining,
      );

    setVideos(
      (current) => [
        ...current,
        ...accepted,
      ],
    );

    if (
      selectedFiles.length >
      remaining
    ) {
      setMediaMessage(
        "HairGrab allows a maximum of 3 product videos.",
      );
    } else {
      setMediaMessage("");
    }

    event.target.value =
      "";
  };

  const removeImage = (
    index: number,
  ) => {
    setImages(
      (current) =>
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index,
        ),
    );
  };

  const removeVideo = (
    index: number,
  ) => {
    setVideos(
      (current) =>
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index,
        ),
    );
  };

  const hasPrices =
    variantRows.length > 0 &&
    variantRows.every(
      (row) =>
        Boolean(
          variantValues[
            row.key
          ]?.price,
        ),
    );

  const ready =
    title.trim().length >
      0 &&
    description
      .trim()
      .length > 0 &&
    productType !== null &&
    resolvedMaterial.length >
      0 &&
    resolvedColor.length >
      0 &&
    hasPrices;

  if (reviewing) {
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
            <div
              style={{
                color:
                  "#7b3fa0",
                fontWeight:
                  "800",
                fontSize:
                  "11px",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "1px",
              }}
            >
              HairGrab Product Review
            </div>

            <h1
              style={{
                color:
                  "#4B1678",
                margin:
                  "6px 0 5px",
              }}
            >
              Review Product
            </h1>

            <p
              style={{
                color:
                  "#776e7b",
                fontSize:
                  "12px",
                margin:
                  "0",
              }}
            >
              Check the listing
              before it is saved or
              submitted.
            </p>

            <div
              style={
                sectionStyle
              }
            >
              <h2
                style={{
                  color:
                    "#4B1678",
                  margin:
                    "0 0 12px",
                }}
              >
                {title}
              </h2>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap:
                    "13px",
                }}
              >
                <ReviewValue
                  label="Product Type"
                  value={
                    productTypeLabel
                  }
                />

                <ReviewValue
                  label="Material"
                  value={
                    resolvedMaterial
                  }
                />

                <ReviewValue
                  label="Color"
                  value={
                    resolvedColor
                  }
                />

                {isHair && (
                  <ReviewValue
                    label="Texture"
                    value={
                      texture ||
                      "Not provided"
                    }
                  />
                )}

                {density && (
                  <ReviewValue
                    label="Density"
                    value={
                      density
                    }
                  />
                )}

                {laceSize && (
                  <ReviewValue
                    label="Lace Size"
                    value={
                      laceSize
                    }
                  />
                )}

                {laceType && (
                  <ReviewValue
                    label="Lace Type"
                    value={
                      laceType
                    }
                  />
                )}
              </div>

              <div
                style={{
                  marginTop:
                    "17px",
                }}
              >
                <div
                  style={
                    labelStyle
                  }
                >
                  Description
                </div>

                <div
                  style={{
                    whiteSpace:
                      "pre-wrap",
                    color:
                      "#54495a",
                    fontSize:
                      "13px",
                    lineHeight:
                      "1.55",
                  }}
                >
                  {description}
                </div>
              </div>
            </div>

            {selectedOptions.length >
              0 && (
              <div
                style={
                  sectionStyle
                }
              >
                <h2
                  style={{
                    color:
                      "#4B1678",
                    fontSize:
                      "18px",
                    margin:
                      "0 0 12px",
                  }}
                >
                  Product Options
                </h2>

                <div
                  style={{
                    display:
                      "flex",
                    flexWrap:
                      "wrap",
                    gap:
                      "7px",
                  }}
                >
                  {selectedOptions.map(
                    (option) => (
                      <span
                        key={
                          option
                        }
                        style={{
                          background:
                            "#f7f0fb",
                          border:
                            "1px solid #dacbe4",
                          borderRadius:
                            "20px",
                          padding:
                            "7px 11px",
                          color:
                            "#4B1678",
                          fontSize:
                            "11px",
                          fontWeight:
                            "800",
                        }}
                      >
                        {optionLabel(
                          option,
                        )}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}

            <div
              style={
                sectionStyle
              }
            >
              <h2
                style={{
                  color:
                    "#4B1678",
                  fontSize:
                    "18px",
                  margin:
                    "0 0 12px",
                }}
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
                    minWidth:
                      "550px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "#f7f0fb",
                      }}
                    >
                      <th style={thStyle}>
                        Variant
                      </th>
                      <th style={thStyle}>
                        Price
                      </th>
                      <th style={thStyle}>
                        Inventory
                      </th>
                      <th style={thStyle}>
                        SKU
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {variantRows.map(
                      (row) => {
                        const data =
                          variantValues[
                            row.key
                          ];

                        return (
                          <tr
                            key={
                              row.key
                            }
                            style={{
                              borderBottom:
                                "1px solid #eee7f2",
                            }}
                          >
                            <td style={tdStyle}>
                              {row.label}
                            </td>
                            <td style={tdStyle}>
                              {money(
                                data
                                  ?.price ||
                                  "0",
                              )}
                            </td>
                            <td style={tdStyle}>
                              {data
                                ?.inventory ||
                                "—"}
                            </td>
                            <td style={tdStyle}>
                              {data
                                ?.sku ||
                                "—"}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={
                sectionStyle
              }
            >
              <h2
                style={{
                  color:
                    "#4B1678",
                  fontSize:
                    "18px",
                  margin:
                    "0 0 12px",
                }}
              >
                Product Media
              </h2>

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
                <ReviewValue
                  label="Photos"
                  value={`${images.length} / 10`}
                />

                <ReviewValue
                  label="Videos"
                  value={`${videos.length} / 3`}
                />
              </div>

              {images.length >
                0 && (
                <div
                  style={{
                    marginTop:
                      "12px",
                    color:
                      "#706776",
                    fontSize:
                      "11px",
                  }}
                >
                  Primary image:{" "}
                  <strong>
                    {
                      images[0]
                        .name
                    }
                  </strong>
                </div>
              )}
            </div>

            <div
              style={{
                ...sectionStyle,
                display:
                  "flex",
                flexWrap:
                  "wrap",
                gap:
                  "10px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setReviewing(
                    false,
                  )
                }
                style={{
                  flex:
                    "1",
                  minWidth:
                    "180px",
                  border:
                    "1px solid #4B1678",
                  background:
                    "#ffffff",
                  color:
                    "#4B1678",
                  borderRadius:
                    "10px",
                  padding:
                    "14px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                ← Back to Edit
              </button>

              <button
                type="button"
                style={{
                  flex:
                    "2",
                  minWidth:
                    "220px",
                  border:
                    "none",
                  background:
                    "#4B1678",
                  color:
                    "#ffffff",
                  borderRadius:
                    "10px",
                  padding:
                    "14px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                Save Product
              </button>
            </div>

            <div
              style={{
                textAlign:
                  "center",
                marginTop:
                  "9px",
                color:
                  "#817787",
                fontSize:
                  "10px",
              }}
            >
              Save Product is
              currently the next
              connection point for
              Shopify.
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            textAlign:
              "center",
            marginBottom:
              "20px",
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
              height:
                "auto",
            }}
          />
        </div>

        <div
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
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              flexWrap:
                "wrap",
              gap:
                "12px",
            }}
          >
            <div>
              <div
                style={{
                  color:
                    "#7b3fa0",
                  fontWeight:
                    "800",
                  fontSize:
                    "11px",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "1.2px",
                }}
              >
                HairGrab Quick Add
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 4px",
                  color:
                    "#4B1678",
                  fontSize:
                    "29px",
                }}
              >
                Add a Product
              </h1>

              <div
                style={{
                  color:
                    "#776e7b",
                  fontSize:
                    "12px",
                }}
              >
                Paste the basics.
                HairGrab handles
                the repetitive
                work.
              </div>
            </div>

            <div
              style={{
                background:
                  "#eef8f0",
                color:
                  "#347143",
                border:
                  "1px solid #cbe3d0",
                padding:
                  "8px 12px",
                borderRadius:
                  "20px",
                fontWeight:
                  "800",
                fontSize:
                  "11px",
              }}
            >
              Goal: under 2 minutes
            </div>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>
              Product Information
            </h2>

            <div
              style={{
                display:
                  "grid",
                gap:
                  "16px",
              }}
            >
              <div>
                <label style={labelStyle}>
                  Product Name *
                </label>

                <input
                  value={title}
                  onChange={(e) =>
                    setTitle(
                      e.target.value,
                    )
                  }
                  placeholder="Paste or type product name"
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Description *
                </label>

                <textarea
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value,
                    )
                  }
                  rows={4}
                  placeholder="Paste your existing description"
                  style={{
                    ...fieldStyle,
                    fontFamily:
                      "Arial, sans-serif",
                    resize:
                      "vertical",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>
              Product Type
            </h2>

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
                (item) => {
                  const selected =
                    productType ===
                    item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        changeProductType(
                          item.value,
                        )
                      }
                      style={{
                        textAlign:
                          "left",
                        border:
                          selected
                            ? "2px solid #4B1678"
                            : "1px solid #ded3e5",
                        background:
                          selected
                            ? "#f7f0fb"
                            : "#ffffff",
                        borderRadius:
                          "11px",
                        padding:
                          "13px",
                        cursor:
                          "pointer",
                      }}
                    >
                      <div
                        style={{
                          color:
                            "#4B1678",
                          fontWeight:
                            "800",
                          fontSize:
                            "14px",
                        }}
                      >
                        {item.label}
                      </div>

                      <div
                        style={{
                          color:
                            "#7d7480",
                          fontSize:
                            "10px",
                          lineHeight:
                            "1.4",
                          marginTop:
                            "4px",
                        }}
                      >
                        {
                          item.description
                        }
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {productType && (
            <>
              <div style={sectionStyle}>
                <h2 style={headingStyle}>
                  Material & Color
                </h2>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(230px, 1fr))",
                    gap:
                      "15px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>
                      Material *
                    </label>

                    <select
                      value={material}
                      onChange={(e) => {
                        setMaterial(
                          e.target.value,
                        );

                        if (
                          e.target
                            .value !==
                          "Other"
                        ) {
                          setCustomMaterial(
                            "",
                          );
                        }
                      }}
                      style={fieldStyle}
                    >
                      <option value="">
                        Select material
                      </option>

                      {materials.map(
                        (item) => (
                          <option
                            key={
                              item
                            }
                            value={
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
                        onChange={(e) =>
                          setCustomMaterial(
                            e.target
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
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Color *
                    </label>

                    <select
                      value={color}
                      onChange={(e) => {
                        setColor(
                          e.target.value,
                        );

                        if (
                          e.target
                            .value !==
                          "Other / Custom"
                        ) {
                          setCustomColor(
                            "",
                          );
                        }
                      }}
                      style={fieldStyle}
                    >
                      {colors.map(
                        (item) => (
                          <option
                            key={
                              item
                            }
                            value={
                              item
                            }
                          >
                            {item}
                          </option>
                        ),
                      )}
                    </select>

                    {color ===
                      "Other / Custom" && (
                      <input
                        value={
                          customColor
                        }
                        onChange={(e) =>
                          setCustomColor(
                            e.target
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
                  </div>
                </div>
              </div>

              <div style={sectionStyle}>
                <h2 style={headingStyle}>
                  Product Options
                </h2>

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
                    (item) => (
                      <ChoiceButton
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        selected={selectedOptions.includes(
                          item.value,
                        )}
                        onClick={() =>
                          setSelectedOptions(
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

                {selectedOptions.length >
                  1 && (
                  <div
                    style={{
                      marginTop:
                        "15px",
                      padding:
                        "13px",
                      background:
                        "#faf7fc",
                      border:
                        "1px solid #dfd2e7",
                      borderRadius:
                        "10px",
                    }}
                  >
                    <label
                      style={{
                        display:
                          "flex",
                        gap:
                          "9px",
                        alignItems:
                          "center",
                        cursor:
                          "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          optionsAreVariants
                        }
                        onChange={(e) =>
                          setOptionsAreVariants(
                            e.target
                              .checked,
                          )
                        }
                      />

                      <div>
                        <strong
                          style={{
                            color:
                              "#4B1678",
                            fontSize:
                              "12px",
                          }}
                        >
                          Price these
                          options
                          separately
                        </strong>

                        <div
                          style={{
                            color:
                              "#817787",
                            fontSize:
                              "10px",
                            marginTop:
                              "2px",
                          }}
                        >
                          Turn this on
                          only when the
                          shopper chooses
                          between these
                          options.
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {isHair && (
            <div style={sectionStyle}>
              <h2 style={headingStyle}>
                Hair Details
              </h2>

              <div>
                <label style={labelStyle}>
                  Texture
                </label>

                <select
                  value={texture}
                  onChange={(e) =>
                    setTexture(
                      e.target.value,
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
                    (item) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div
                style={{
                  marginTop:
                    "18px",
                }}
              >
                <label style={labelStyle}>
                  Available Lengths
                </label>

                <div
                  style={{
                    display:
                      "flex",
                    flexWrap:
                      "wrap",
                    gap:
                      "7px",
                  }}
                >
                  {allLengths.map(
                    (length) => {
                      const selected =
                        selectedLengths.includes(
                          length,
                        );

                      return (
                        <div
                          key={
                            length
                          }
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLengths(
                                (
                                  current,
                                ) =>
                                  toggleValue(
                                    current,
                                    length,
                                  ),
                              )
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
                                "8px",
                              padding:
                                "8px 10px",
                              fontWeight:
                                "800",
                              fontSize:
                                "12px",
                              cursor:
                                "pointer",
                            }}
                          >
                            {length}"
                          </button>

                          {customLengths.includes(
                            length,
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                removeCustomLength(
                                  length,
                                )
                              }
                              style={{
                                border:
                                  "none",
                                background:
                                  "transparent",
                                color:
                                  "#9a849f",
                                cursor:
                                  "pointer",
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap:
                      "8px",
                    flexWrap:
                      "wrap",
                    marginTop:
                      "11px",
                  }}
                >
                  <input
                    value={
                      customLength
                    }
                    onChange={(e) =>
                      setCustomLength(
                        e.target.value,
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        e.preventDefault();
                        addCustomLength();
                      }
                    }}
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
                    style={{
                      border:
                        "1px solid #4B1678",
                      background:
                        "#ffffff",
                      color:
                        "#4B1678",
                      borderRadius:
                        "9px",
                      padding:
                        "9px 14px",
                      fontWeight:
                        "800",
                      cursor:
                        "pointer",
                    }}
                  >
                    + Add Other Length
                  </button>
                </div>
              </div>

              <details
                style={{
                  marginTop:
                    "18px",
                }}
              >
                <summary
                  style={{
                    color:
                      "#4B1678",
                    fontWeight:
                      "800",
                    fontSize:
                      "12px",
                    cursor:
                      "pointer",
                  }}
                >
                  Optional product details
                </summary>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(200px, 1fr))",
                    gap:
                      "14px",
                    marginTop:
                      "14px",
                  }}
                >
                  {productType ===
                    "WIG" && (
                    <>
                      <SelectBox
                        label="Density"
                        value={density}
                        values={
                          densities
                        }
                        onChange={
                          setDensity
                        }
                      />

                      <SelectBox
                        label="Lace Size"
                        value={
                          laceSize
                        }
                        values={
                          laceSizes
                        }
                        onChange={
                          setLaceSize
                        }
                      />

                      <SelectBox
                        label="Lace Type"
                        value={
                          laceType
                        }
                        values={
                          laceTypes
                        }
                        onChange={
                          setLaceType
                        }
                      />

                      <div>
                        <label style={labelStyle}>
                          Cap Size
                        </label>

                        <select
                          value={
                            capSize
                          }
                          onChange={(e) =>
                            setCapSize(
                              e.target
                                .value,
                            )
                          }
                          style={fieldStyle}
                        >
                          <option value="">
                            Select
                          </option>
                          <option>
                            Small
                          </option>
                          <option>
                            Medium
                          </option>
                          <option>
                            Large
                          </option>
                          <option>
                            Adjustable
                          </option>
                        </select>
                      </div>
                    </>
                  )}

                  {productType ===
                    "BUNDLE" && (
                    <div>
                      <label style={labelStyle}>
                        Bundle Weight
                      </label>

                      <select
                        value={
                          bundleWeight
                        }
                        onChange={(e) =>
                          setBundleWeight(
                            e.target
                              .value,
                          )
                        }
                        style={fieldStyle}
                      >
                        <option>
                          50g
                        </option>
                        <option>
                          100g
                        </option>
                        <option>
                          120g
                        </option>
                        <option>
                          150g
                        </option>
                        <option>
                          200g+
                        </option>
                      </select>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {productType && (
            <div style={sectionStyle}>
              <h2 style={headingStyle}>
                Variant Pricing
              </h2>

              {isHair &&
                selectedLengths.length ===
                  0 && (
                  <div
                    style={{
                      background:
                        "#fff9e9",
                      border:
                        "1px solid #eadcae",
                      color:
                        "#755f1d",
                      borderRadius:
                        "9px",
                      padding:
                        "11px",
                      fontSize:
                        "11px",
                    }}
                  >
                    Select at least
                    one length above.
                  </div>
                )}

              {variantRows.length >
                0 && (
                <>
                  <div
                    style={{
                      marginBottom:
                        "15px",
                      padding:
                        "14px",
                      background:
                        "#f7f0fb",
                      border:
                        "1px solid #e1d5e8",
                      borderRadius:
                        "11px",
                    }}
                  >
                    <div
                      style={{
                        color:
                          "#4B1678",
                        fontWeight:
                          "800",
                        fontSize:
                          "13px",
                        marginBottom:
                          "10px",
                      }}
                    >
                      Fast Price Builder
                    </div>

                    <div
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap:
                          "10px",
                      }}
                    >
                      <div>
                        <label style={labelStyle}>
                          Starting Price
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          value={
                            startingPrice
                          }
                          onChange={(e) =>
                            setStartingPrice(
                              e.target
                                .value,
                            )
                          }
                          placeholder="89.00"
                          style={fieldStyle}
                        />
                      </div>

                      <div>
                        <label style={labelStyle}>
                          Increase Each Length By
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          value={
                            priceIncrease
                          }
                          onChange={(e) =>
                            setPriceIncrease(
                              e.target
                                .value,
                            )
                          }
                          placeholder="10.00"
                          style={fieldStyle}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={
                        autoPriceByLength
                      }
                      style={{
                        marginTop:
                          "10px",
                        border:
                          "none",
                        background:
                          "#4B1678",
                        color:
                          "#ffffff",
                        borderRadius:
                          "8px",
                        padding:
                          "10px 14px",
                        fontWeight:
                          "800",
                        cursor:
                          "pointer",
                      }}
                    >
                      Auto-Fill Variant Prices
                    </button>
                  </div>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap:
                        "10px",
                      marginBottom:
                        "15px",
                    }}
                  >
                    <QuickFill
                      label="Fill All Prices"
                      value={
                        quickPrice
                      }
                      setValue={
                        setQuickPrice
                      }
                      onFill={
                        fillAllPrices
                      }
                      placeholder="99.00"
                    />

                    <QuickFill
                      label="Fill All Inventory"
                      value={
                        quickInventory
                      }
                      setValue={
                        setQuickInventory
                      }
                      onFill={
                        fillAllInventory
                      }
                      placeholder="5"
                    />
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
                        borderCollapse:
                          "collapse",
                        minWidth:
                          "620px",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background:
                              "#f7f0fb",
                          }}
                        >
                          <th style={thStyle}>
                            Variant
                          </th>
                          <th style={thStyle}>
                            Price *
                          </th>
                          <th style={thStyle}>
                            Inventory
                          </th>
                          <th style={thStyle}>
                            SKU
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {variantRows.map(
                          (row) => {
                            const data =
                              variantValues[
                                row
                                  .key
                              ] || {
                                price:
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
                                style={{
                                  borderBottom:
                                    "1px solid #eee7f2",
                                }}
                              >
                                <td style={tdStyle}>
                                  {
                                    row.label
                                  }
                                </td>

                                <td style={tdStyle}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={
                                      data.price
                                    }
                                    onChange={(e) =>
                                      setVariantField(
                                        row.key,
                                        "price",
                                        e.target
                                          .value,
                                      )
                                    }
                                    style={fieldStyle}
                                  />
                                </td>

                                <td style={tdStyle}>
                                  <input
                                    type="number"
                                    value={
                                      data.inventory
                                    }
                                    onChange={(e) =>
                                      setVariantField(
                                        row.key,
                                        "inventory",
                                        e.target
                                          .value,
                                      )
                                    }
                                    style={fieldStyle}
                                  />
                                </td>

                                <td style={tdStyle}>
                                  <input
                                    value={
                                      data.sku
                                    }
                                    onChange={(e) =>
                                      setVariantField(
                                        row.key,
                                        "sku",
                                        e.target
                                          .value,
                                      )
                                    }
                                    placeholder="Optional"
                                    style={fieldStyle}
                                  />
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {productType && (
            <div style={sectionStyle}>
              <h2 style={headingStyle}>
                Photos & Videos
              </h2>

              <p
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "11px",
                }}
              >
                Up to 10 images and
                3 videos.
              </p>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(250px, 1fr))",
                  gap:
                    "14px",
                }}
              >
                <MediaBox
                  title="Product Photos"
                  count={
                    images.length
                  }
                  max={10}
                  accept="image/*"
                  onChange={
                    handleImages
                  }
                />

                <MediaBox
                  title="Product Videos"
                  count={
                    videos.length
                  }
                  max={3}
                  accept="video/*"
                  onChange={
                    handleVideos
                  }
                />
              </div>

              {images.length >
                0 && (
                <MediaList
                  title="Photos"
                  files={images}
                  showPrimary
                  onRemove={
                    removeImage
                  }
                />
              )}

              {videos.length >
                0 && (
                <MediaList
                  title="Videos"
                  files={videos}
                  onRemove={
                    removeVideo
                  }
                />
              )}

              {mediaMessage && (
                <div
                  style={{
                    marginTop:
                      "10px",
                    background:
                      "#fff9e9",
                    color:
                      "#755f1d",
                    border:
                      "1px solid #eadcae",
                    borderRadius:
                      "8px",
                    padding:
                      "9px",
                    fontSize:
                      "10px",
                  }}
                >
                  {mediaMessage}
                </div>
              )}
            </div>
          )}

          <div style={sectionStyle}>
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                ready &&
                setReviewing(
                  true,
                )
              }
              style={{
                width:
                  "100%",
                border:
                  "none",
                borderRadius:
                  "10px",
                padding:
                  "15px",
                background:
                  ready
                    ? "#4B1678"
                    : "#c9bdcf",
                color:
                  "#ffffff",
                fontWeight:
                  "800",
                fontSize:
                  "14px",
                cursor:
                  ready
                    ? "pointer"
                    : "not-allowed",
              }}
            >
              Review Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const headingStyle = {
  margin: "0 0 15px",
  color: "#4B1678",
  fontSize: "19px",
};

const thStyle = {
  textAlign: "left" as const,
  color: "#4B1678",
  fontSize: "11px",
  padding: "10px",
};

const tdStyle = {
  padding: "8px",
  color: "#35263e",
  fontSize: "12px",
};

function SelectBox({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
      </label>

      <select
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value,
          )
        }
        style={fieldStyle}
      >
        <option value="">
          Select
        </option>

        {values.map(
          (item) => (
            <option
              key={item}
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
  setValue,
  onFill,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (
    value: string,
  ) => void;
  onFill: () => void;
  placeholder: string;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
      </label>

      <div
        style={{
          display: "flex",
          gap: "6px",
        }}
      >
        <input
          type="number"
          value={value}
          onChange={(e) =>
            setValue(
              e.target.value,
            )
          }
          placeholder={
            placeholder
          }
          style={fieldStyle}
        />

        <button
          type="button"
          onClick={onFill}
          style={{
            border:
              "1px solid #4B1678",
            background:
              "#ffffff",
            color:
              "#4B1678",
            borderRadius:
              "8px",
            padding:
              "8px 11px",
            fontWeight:
              "800",
            cursor:
              "pointer",
            whiteSpace:
              "nowrap",
          }}
        >
          Fill All
        </button>
      </div>
    </div>
  );
}

function MediaBox({
  title,
  count,
  max,
  accept,
  onChange,
}: {
  title: string;
  count: number;
  max: number;
  accept: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
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
            fontSize:
              "13px",
          }}
        >
          {title}
        </strong>

        <span
          style={{
            color:
              "#817787",
            fontSize:
              "10px",
          }}
        >
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
          fontSize:
            "11px",
          cursor:
            "pointer",
        }}
      >
        + Add {title}

        <input
          type="file"
          accept={accept}
          multiple
          onChange={onChange}
          style={{
            display:
              "none",
          }}
        />
      </label>
    </div>
  );
}

function MediaList({
  title,
  files,
  onRemove,
  showPrimary = false,
}: {
  title: string;
  files: File[];
  onRemove: (
    index: number,
  ) => void;
  showPrimary?: boolean;
}) {
  return (
    <div
      style={{
        marginTop:
          "13px",
      }}
    >
      <div
        style={{
          ...labelStyle,
          marginBottom:
            "8px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          display:
            "grid",
          gap:
            "6px",
        }}
      >
        {files.map(
          (file, index) => (
            <div
              key={`${file.name}-${index}`}
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap:
                  "10px",
                padding:
                  "8px 10px",
                background:
                  "#faf7fc",
                borderRadius:
                  "8px",
                color:
                  "#54495a",
                fontSize:
                  "10px",
              }}
            >
              <span
                style={{
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {showPrimary &&
                  index ===
                    0 && (
                    <strong>
                      Primary ·{" "}
                    </strong>
                  )}

                {file.name}
              </span>

              <button
                type="button"
                onClick={() =>
                  onRemove(
                    index,
                  )
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  color:
                    "#8c738f",
                  cursor:
                    "pointer",
                  fontSize:
                    "16px",
                }}
              >
                ×
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ReviewValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "10px",
          marginBottom:
            "3px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#21152a",
          fontSize:
            "12px",
          fontWeight:
            "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}