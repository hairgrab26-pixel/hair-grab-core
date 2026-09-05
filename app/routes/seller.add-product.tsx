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

const densities = [
  "130%",
  "150%",
  "180%",
  "200%",
  "250%",
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
    ? current.filter((item) => item !== value)
    : [...current, value];
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
  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [productType, setProductType] =
    useState<ProductType | null>(null);

  const [selectedOptions, setSelectedOptions] =
    useState<string[]>([]);

  const [optionsAreVariants, setOptionsAreVariants] =
    useState(false);

  const [material, setMaterial] =
    useState("");

  const [customMaterial, setCustomMaterial] =
    useState("");

  const [texture, setTexture] =
    useState("");

  const [color, setColor] =
    useState("Natural / 1B");

  const [customColor, setCustomColor] =
    useState("");

  const [selectedLengths, setSelectedLengths] =
    useState<string[]>([]);

  const [customLength, setCustomLength] =
    useState("");

  const [customLengths, setCustomLengths] =
    useState<string[]>([]);

  const [density, setDensity] =
    useState("");

  const [laceSize, setLaceSize] =
    useState("");

  const [laceType, setLaceType] =
    useState("");

  const [capSize, setCapSize] =
    useState("");

  const [bundleWeight, setBundleWeight] =
    useState("100g");

  const [quickPrice, setQuickPrice] =
    useState("");

  const [quickInventory, setQuickInventory] =
    useState("");

  const [variantValues, setVariantValues] =
    useState<Record<string, VariantData>>({});

  const [images, setImages] =
    useState<File[]>([]);

  const [videos, setVideos] =
    useState<File[]>([]);

  const [mediaMessage, setMediaMessage] =
    useState("");

  const isHair =
    productType !== null &&
    productType !== "HAIR_ESSENTIAL";

  const currentOptions =
    productType
      ? productOptions[productType]
      : [];

  const optionLabel = (value: string) =>
    currentOptions.find(
      (item) => item.value === value,
    )?.label || value;

  const allLengths =
    useMemo(
      () => [
        ...standardLengths,
        ...customLengths,
      ],
      [customLengths],
    );

  const variantRows =
    useMemo(() => {
      if (!productType) {
        return [];
      }

      if (
        productType === "HAIR_ESSENTIAL"
      ) {
        return [
          {
            key: "DEFAULT",
            label: "Standard",
          },
        ];
      }

      const rowLengths =
        selectedLengths.length > 0
          ? selectedLengths
          : [""];

      const sellableOptions =
        optionsAreVariants &&
        selectedOptions.length > 0
          ? selectedOptions
          : [""];

      const rows: Array<{
        key: string;
        label: string;
      }> = [];

      for (const length of rowLengths) {
        for (const option of sellableOptions) {
          const key = [
            length || "NO_LENGTH",
            option || "NO_OPTION",
          ].join("__");

          const labels: string[] = [];

          if (length) {
            labels.push(`${length}"`);
          }

          if (option) {
            labels.push(optionLabel(option));
          }

          rows.push({
            key,
            label:
              labels.join(" / ") ||
              "Standard",
          });
        }
      }

      return rows;
    }, [
      productType,
      selectedLengths,
      optionsAreVariants,
      selectedOptions,
      currentOptions,
    ]);

  const setVariantField = (
    key: string,
    field: "price" | "inventory" | "sku",
    value: string,
  ) => {
    setVariantValues((current) => ({
      ...current,

      [key]: {
        price:
          current[key]?.price || "",
        inventory:
          current[key]?.inventory || "",
        sku:
          current[key]?.sku || "",

        [field]: value,
      },
    }));
  };

  const fillAllPrices = () => {
    if (!quickPrice) return;

    setVariantValues((current) => {
      const next = { ...current };

      for (const row of variantRows) {
        next[row.key] = {
          price: quickPrice,
          inventory:
            next[row.key]?.inventory || "",
          sku:
            next[row.key]?.sku || "",
        };
      }

      return next;
    });
  };

  const fillAllInventory = () => {
    if (!quickInventory) return;

    setVariantValues((current) => {
      const next = { ...current };

      for (const row of variantRows) {
        next[row.key] = {
          price:
            next[row.key]?.price || "",
          inventory: quickInventory,
          sku:
            next[row.key]?.sku || "",
        };
      }

      return next;
    });
  };

  const changeProductType = (
    type: ProductType,
  ) => {
    setProductType(type);
    setSelectedOptions([]);
    setOptionsAreVariants(false);
  };

  const addCustomLength = () => {
    const clean =
      customLength
        .replace(/[^0-9.]/g, "")
        .trim();

    if (!clean) return;

    if (
      !customLengths.includes(clean)
    ) {
      setCustomLengths(
        (current) => [
          ...current,
          clean,
        ],
      );
    }

    if (
      !selectedLengths.includes(clean)
    ) {
      setSelectedLengths(
        (current) => [
          ...current,
          clean,
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
          (item) => item !== value,
        ),
    );

    setSelectedLengths(
      (current) =>
        current.filter(
          (item) => item !== value,
        ),
    );
  };

  const handleImages = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files =
      Array.from(
        event.target.files || [],
      );

    const remaining =
      10 - images.length;

    if (remaining <= 0) {
      setMediaMessage(
        "This product already has 10 images.",
      );
      return;
    }

    const accepted =
      files.slice(0, remaining);

    setImages((current) => [
      ...current,
      ...accepted,
    ]);

    if (
      files.length > remaining
    ) {
      setMediaMessage(
        `HairGrab allows up to 10 images. ${accepted.length} image(s) were added.`,
      );
    } else {
      setMediaMessage("");
    }

    event.target.value = "";
  };

  const handleVideos = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files =
      Array.from(
        event.target.files || [],
      );

    const remaining =
      3 - videos.length;

    if (remaining <= 0) {
      setMediaMessage(
        "This product already has 3 videos.",
      );
      return;
    }

    const accepted =
      files.slice(0, remaining);

    setVideos((current) => [
      ...current,
      ...accepted,
    ]);

    if (
      files.length > remaining
    ) {
      setMediaMessage(
        `HairGrab allows up to 3 videos. ${accepted.length} video(s) were added.`,
      );
    } else {
      setMediaMessage("");
    }

    event.target.value = "";
  };

  const hasPrices =
    variantRows.length > 0 &&
    variantRows.every(
      (row) =>
        Boolean(
          variantValues[row.key]?.price,
        ),
    );

  const resolvedMaterial =
    material === "Other"
      ? customMaterial.trim()
      : material;

  const resolvedColor =
    color === "Other / Custom"
      ? customColor.trim()
      : color;

  const ready =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    productType !== null &&
    resolvedMaterial.length > 0 &&
    resolvedColor.length > 0 &&
    hasPrices;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        padding: "28px 18px 70px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <div
        style={{
          maxWidth: "920px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
          }}
        >
          <img
            src="/hairgrab-logo.png"
            alt="HairGrab"
            style={{
              width: "235px",
              maxWidth: "70%",
              height: "auto",
            }}
          />
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e6d9ef",
            borderRadius: "18px",
            padding: "26px",
            boxShadow:
              "0 4px 18px rgba(75,22,120,.07)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  color: "#7b3fa0",
                  fontSize: "11px",
                  fontWeight: "800",
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}
              >
                HairGrab Quick Add
              </div>

              <h1
                style={{
                  margin: "5px 0 4px",
                  color: "#4B1678",
                  fontSize: "29px",
                }}
              >
                Add a Product
              </h1>

              <div
                style={{
                  color: "#776e7b",
                  fontSize: "12px",
                }}
              >
                Paste the basics. HairGrab handles the repetitive parts.
              </div>
            </div>

            <div
              style={{
                background: "#eef8f0",
                color: "#347143",
                border: "1px solid #cbe3d0",
                padding: "8px 12px",
                borderRadius: "20px",
                fontWeight: "800",
                fontSize: "11px",
              }}
            >
              Goal: under 2 minutes
            </div>
          </div>

          {/* PRODUCT INFORMATION */}

          <div style={sectionStyle}>
            <h2
              style={{
                margin: "0 0 15px",
                color: "#4B1678",
                fontSize: "19px",
              }}
            >
              Product Information
            </h2>

            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              <div>
                <label style={labelStyle}>
                  Product Name *
                </label>

                <input
                  value={title}
                  onChange={(event) =>
                    setTitle(
                      event.target.value,
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
                  onChange={(event) =>
                    setDescription(
                      event.target.value,
                    )
                  }
                  rows={4}
                  placeholder="Paste your existing description"
                  style={{
                    ...fieldStyle,
                    fontFamily:
                      "Arial, sans-serif",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          </div>

          {/* PRODUCT TYPE */}

          <div style={sectionStyle}>
            <h2
              style={{
                margin: "0 0 5px",
                color: "#4B1678",
                fontSize: "19px",
              }}
            >
              Product Type
            </h2>

            <div
              style={{
                color: "#817787",
                fontSize: "11px",
                marginBottom: "13px",
              }}
            >
              Choose one main product type.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "10px",
              }}
            >
              {productTypes.map(
                (item) => {
                  const selected =
                    productType === item.value;

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
                        textAlign: "left",
                        border: selected
                          ? "2px solid #4B1678"
                          : "1px solid #ded3e5",
                        background: selected
                          ? "#f7f0fb"
                          : "#ffffff",
                        borderRadius: "11px",
                        padding: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          color: "#4B1678",
                          fontWeight: "800",
                          fontSize: "14px",
                        }}
                      >
                        {item.label}
                      </div>

                      <div
                        style={{
                          color: "#7d7480",
                          fontSize: "10px",
                          lineHeight: "1.4",
                          marginTop: "4px",
                        }}
                      >
                        {item.description}
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* UNIVERSAL MATERIAL + COLOR */}

          {productType && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Material & Color
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "15px",
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Material *
                  </label>

                  <select
                    value={material}
                    onChange={(event) => {
                      setMaterial(
                        event.target.value,
                      );

                      if (
                        event.target.value !==
                        "Other"
                      ) {
                        setCustomMaterial("");
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
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </select>

                  {material === "Other" && (
                    <input
                      value={customMaterial}
                      onChange={(event) =>
                        setCustomMaterial(
                          event.target.value,
                        )
                      }
                      placeholder="Type material"
                      style={{
                        ...fieldStyle,
                        marginTop: "8px",
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
                    onChange={(event) => {
                      setColor(
                        event.target.value,
                      );

                      if (
                        event.target.value !==
                        "Other / Custom"
                      ) {
                        setCustomColor("");
                      }
                    }}
                    style={fieldStyle}
                  >
                    {colors.map(
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

                  {color ===
                    "Other / Custom" && (
                    <input
                      value={customColor}
                      onChange={(event) =>
                        setCustomColor(
                          event.target.value,
                        )
                      }
                      placeholder="Example: Champagne Blonde"
                      style={{
                        ...fieldStyle,
                        marginTop: "8px",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PRODUCT OPTIONS */}

          {productType && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 5px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Product Options
              </h2>

              <div
                style={{
                  color: "#817787",
                  fontSize: "11px",
                  marginBottom: "13px",
                }}
              >
                Select everything that applies.
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {currentOptions.map(
                  (item) => (
                    <ChoiceButton
                      key={item.value}
                      label={item.label}
                      selected={selectedOptions.includes(
                        item.value,
                      )}
                      onClick={() =>
                        setSelectedOptions(
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

              {selectedOptions.length >
                1 && (
                <div
                  style={{
                    marginTop: "15px",
                    padding: "13px",
                    border:
                      "1px solid #dfd2e7",
                    borderRadius: "10px",
                    background: "#faf7fc",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        optionsAreVariants
                      }
                      onChange={(event) =>
                        setOptionsAreVariants(
                          event.target.checked,
                        )
                      }
                    />

                    <div>
                      <div
                        style={{
                          color: "#4B1678",
                          fontWeight: "800",
                          fontSize: "12px",
                        }}
                      >
                        Price these options separately
                      </div>

                      <div
                        style={{
                          color: "#817787",
                          fontSize: "10px",
                          marginTop: "2px",
                        }}
                      >
                        Use this only when the customer chooses between these options.
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* HAIR DETAILS */}

          {isHair && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Hair Details
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: "15px",
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Texture
                  </label>

                  <select
                    value={texture}
                    onChange={(event) =>
                      setTexture(
                        event.target.value,
                      )
                    }
                    style={fieldStyle}
                  >
                    <option value="">
                      Select texture
                    </option>

                    {textures.map(
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
              </div>

              <div
                style={{
                  marginTop: "18px",
                }}
              >
                <label style={labelStyle}>
                  Available Lengths
                </label>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "7px",
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
                          key={length}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLengths(
                                (current) =>
                                  toggleValue(
                                    current,
                                    length,
                                  ),
                              )
                            }
                            style={{
                              border: selected
                                ? "2px solid #4B1678"
                                : "1px solid #d8cce0",
                              background: selected
                                ? "#f7f0fb"
                                : "#ffffff",
                              color: "#4B1678",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontWeight: "800",
                              fontSize: "12px",
                              cursor: "pointer",
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
                                border: "none",
                                background:
                                  "transparent",
                                color: "#9a849f",
                                cursor: "pointer",
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
                    display: "flex",
                    gap: "8px",
                    marginTop: "11px",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={customLength}
                    onChange={(event) =>
                      setCustomLength(
                        event.target.value,
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        addCustomLength();
                      }
                    }}
                    placeholder="Other length, e.g. 42"
                    style={{
                      ...fieldStyle,
                      maxWidth: "220px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={addCustomLength}
                    style={{
                      border:
                        "1px solid #4B1678",
                      background: "#ffffff",
                      color: "#4B1678",
                      borderRadius: "9px",
                      padding: "9px 14px",
                      fontWeight: "800",
                      cursor: "pointer",
                    }}
                  >
                    + Add Other Length
                  </button>
                </div>
              </div>

              <details
                style={{
                  marginTop: "18px",
                  padding: "12px 0",
                }}
              >
                <summary
                  style={{
                    color: "#4B1678",
                    fontWeight: "800",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Optional hair details
                </summary>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "14px",
                    marginTop: "14px",
                  }}
                >
                  {productType === "WIG" && (
                    <>
                      <div>
                        <label style={labelStyle}>
                          Density
                        </label>

                        <select
                          value={density}
                          onChange={(event) =>
                            setDensity(
                              event.target.value,
                            )
                          }
                          style={fieldStyle}
                        >
                          <option value="">
                            Select
                          </option>

                          {densities.map(
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

                      <div>
                        <label style={labelStyle}>
                          Lace Size
                        </label>

                        <select
                          value={laceSize}
                          onChange={(event) =>
                            setLaceSize(
                              event.target.value,
                            )
                          }
                          style={fieldStyle}
                        >
                          <option value="">
                            Select
                          </option>

                          {laceSizes.map(
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

                      <div>
                        <label style={labelStyle}>
                          Lace Type
                        </label>

                        <select
                          value={laceType}
                          onChange={(event) =>
                            setLaceType(
                              event.target.value,
                            )
                          }
                          style={fieldStyle}
                        >
                          <option value="">
                            Select
                          </option>

                          {laceTypes.map(
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

                      <div>
                        <label style={labelStyle}>
                          Cap Size
                        </label>

                        <select
                          value={capSize}
                          onChange={(event) =>
                            setCapSize(
                              event.target.value,
                            )
                          }
                          style={fieldStyle}
                        >
                          <option value="">
                            Select
                          </option>
                          <option>Small</option>
                          <option>Medium</option>
                          <option>Large</option>
                          <option>Adjustable</option>
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
                        value={bundleWeight}
                        onChange={(event) =>
                          setBundleWeight(
                            event.target.value,
                          )
                        }
                        style={fieldStyle}
                      >
                        <option>50g</option>
                        <option>100g</option>
                        <option>120g</option>
                        <option>150g</option>
                        <option>200g+</option>
                      </select>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* VARIANT PRICING */}

          {productType && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 5px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Variant Pricing
              </h2>

              <div
                style={{
                  color: "#817787",
                  fontSize: "11px",
                  marginBottom: "15px",
                }}
              >
                HairGrab builds the combinations. You only enter the selling price.
              </div>

              {isHair &&
                selectedLengths.length ===
                  0 && (
                  <div
                    style={{
                      background: "#fff9e9",
                      border:
                        "1px solid #eadcae",
                      color: "#755f1d",
                      borderRadius: "9px",
                      padding: "11px",
                      fontSize: "11px",
                      marginBottom: "14px",
                    }}
                  >
                    Select at least one length above to build the pricing rows.
                  </div>
                )}

              {variantRows.length > 0 &&
                (!isHair ||
                  selectedLengths.length >
                    0) && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "10px",
                        marginBottom: "15px",
                        padding: "13px",
                        background: "#faf7fc",
                        border:
                          "1px solid #e5daec",
                        borderRadius: "10px",
                      }}
                    >
                      <div>
                        <label style={labelStyle}>
                          Quick Fill Price
                        </label>

                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                          }}
                        >
                          <input
                            type="number"
                            step="0.01"
                            value={quickPrice}
                            onChange={(event) =>
                              setQuickPrice(
                                event.target.value,
                              )
                            }
                            placeholder="99.00"
                            style={fieldStyle}
                          />

                          <button
                            type="button"
                            onClick={fillAllPrices}
                            style={{
                              border: "none",
                              background: "#4B1678",
                              color: "#ffffff",
                              borderRadius: "8px",
                              padding: "8px 11px",
                              fontWeight: "800",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Fill All
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>
                          Quick Fill Inventory
                        </label>

                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                          }}
                        >
                          <input
                            type="number"
                            value={quickInventory}
                            onChange={(event) =>
                              setQuickInventory(
                                event.target.value,
                              )
                            }
                            placeholder="5"
                            style={fieldStyle}
                          />

                          <button
                            type="button"
                            onClick={fillAllInventory}
                            style={{
                              border:
                                "1px solid #4B1678",
                              background: "#ffffff",
                              color: "#4B1678",
                              borderRadius: "8px",
                              padding: "8px 11px",
                              fontWeight: "800",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Fill All
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        overflowX: "auto",
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          borderCollapse:
                            "collapse",
                          minWidth: "620px",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: "#f7f0fb",
                            }}
                          >
                            <th
                              style={{
                                textAlign: "left",
                                padding: "10px",
                                color: "#4B1678",
                                fontSize: "11px",
                              }}
                            >
                              Variant
                            </th>

                            <th
                              style={{
                                textAlign: "left",
                                padding: "10px",
                                color: "#4B1678",
                                fontSize: "11px",
                              }}
                            >
                              Price *
                            </th>

                            <th
                              style={{
                                textAlign: "left",
                                padding: "10px",
                                color: "#4B1678",
                                fontSize: "11px",
                              }}
                            >
                              Inventory
                            </th>

                            <th
                              style={{
                                textAlign: "left",
                                padding: "10px",
                                color: "#4B1678",
                                fontSize: "11px",
                              }}
                            >
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
                                ] || {
                                  price: "",
                                  inventory: "",
                                  sku: "",
                                };

                              return (
                                <tr
                                  key={row.key}
                                  style={{
                                    borderBottom:
                                      "1px solid #eee7f2",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "10px",
                                      color: "#35263e",
                                      fontWeight: "800",
                                      fontSize: "12px",
                                    }}
                                  >
                                    {row.label}
                                  </td>

                                  <td
                                    style={{
                                      padding: "8px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={data.price}
                                      onChange={(event) =>
                                        setVariantField(
                                          row.key,
                                          "price",
                                          event.target.value,
                                        )
                                      }
                                      placeholder="$"
                                      style={{
                                        ...fieldStyle,
                                        minWidth: "110px",
                                      }}
                                    />
                                  </td>

                                  <td
                                    style={{
                                      padding: "8px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      value={data.inventory}
                                      onChange={(event) =>
                                        setVariantField(
                                          row.key,
                                          "inventory",
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Qty"
                                      style={{
                                        ...fieldStyle,
                                        minWidth: "95px",
                                      }}
                                    />
                                  </td>

                                  <td
                                    style={{
                                      padding: "8px",
                                    }}
                                  >
                                    <input
                                      value={data.sku}
                                      onChange={(event) =>
                                        setVariantField(
                                          row.key,
                                          "sku",
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Optional"
                                      style={{
                                        ...fieldStyle,
                                        minWidth: "130px",
                                      }}
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

          {/* MEDIA */}

          {productType && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 5px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Photos & Videos
              </h2>

              <div
                style={{
                  color: "#817787",
                  fontSize: "11px",
                  marginBottom: "15px",
                }}
              >
                Add up to 10 images and 3 videos.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    border:
                      "1px solid #ded3e5",
                    borderRadius: "12px",
                    padding: "15px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <strong
                      style={{
                        color: "#4B1678",
                        fontSize: "13px",
                      }}
                    >
                      Product Photos
                    </strong>

                    <span
                      style={{
                        fontSize: "10px",
                        color: "#817787",
                      }}
                    >
                      {images.length}/10
                    </span>
                  </div>

                  <label
                    style={{
                      display: "block",
                      border:
                        "1px dashed #bdaac9",
                      borderRadius: "9px",
                      padding: "13px",
                      textAlign: "center",
                      color: "#4B1678",
                      fontWeight: "800",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Photos

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImages}
                      style={{
                        display: "none",
                      }}
                    />
                  </label>
                </div>

                <div
                  style={{
                    border:
                      "1px solid #ded3e5",
                    borderRadius: "12px",
                    padding: "15px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <strong
                      style={{
                        color: "#4B1678",
                        fontSize: "13px",
                      }}
                    >
                      Product Videos
                    </strong>

                    <span
                      style={{
                        fontSize: "10px",
                        color: "#817787",
                      }}
                    >
                      {videos.length}/3
                    </span>
                  </div>

                  <label
                    style={{
                      display: "block",
                      border:
                        "1px dashed #bdaac9",
                      borderRadius: "9px",
                      padding: "13px",
                      textAlign: "center",
                      color: "#4B1678",
                      fontWeight: "800",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Videos

                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={handleVideos}
                      style={{
                        display: "none",
                      }}
                    />
                  </label>
                </div>
              </div>

              {mediaMessage && (
                <div
                  style={{
                    marginTop: "10px",
                    color: "#755f1d",
                    background: "#fff9e9",
                    border:
                      "1px solid #eadcae",
                    padding: "9px",
                    borderRadius: "8px",
                    fontSize: "10px",
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
              style={{
                width: "100%",
                border: "none",
                borderRadius: "10px",
                padding: "15px 18px",
                background: ready
                  ? "#4B1678"
                  : "#c9bdcf",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "800",
                cursor: ready
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Review Product
            </button>

            <div
              style={{
                textAlign: "center",
                marginTop: "8px",
                color: "#817787",
                fontSize: "10px",
              }}
            >
              Next we connect this product structure to Shopify.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}