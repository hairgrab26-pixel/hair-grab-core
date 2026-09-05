import { useMemo, useState } from "react";

type ProductType =
  | "WIG"
  | "BUNDLE"
  | "CLOSURE_FRONTAL"
  | "EXTENSION"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIAL";

const productTypes: Array<{
  value: ProductType;
  label: string;
  description: string;
}> = [
  {
    value: "WIG",
    label: "Wig",
    description: "Glueless, lace, closure, frontal and other wigs.",
  },
  {
    value: "BUNDLE",
    label: "Bundles",
    description: "Single bundles, bundle deals and bundle packages.",
  },
  {
    value: "CLOSURE_FRONTAL",
    label: "Closure / Frontal",
    description: "Closures, frontals and 360 lace pieces.",
  },
  {
    value: "EXTENSION",
    label: "Extensions",
    description: "Clip-ins, tape-ins, I-tips, ponytails and halos.",
  },
  {
    value: "BRAIDING_HAIR",
    label: "Braiding Hair",
    description: "Human or synthetic hair for braids and protective styles.",
  },
  {
    value: "HAIR_ESSENTIAL",
    label: "Hair Essentials",
    description: "Hair care, tools and accessories.",
  },
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

const lengths = [
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

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "12px 13px",
  border: "1px solid #d8cce0",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#21152a",
  fontSize: "14px",
};

const labelStyle = {
  display: "block",
  marginBottom: "7px",
  color: "#4B1678",
  fontWeight: "800",
  fontSize: "13px",
};

const sectionStyle = {
  marginTop: "26px",
  paddingTop: "24px",
  borderTop: "1px solid #eee7f2",
};

type MultiChoiceProps = {
  value: string;
  label: string;
  selected: boolean;
  onClick: () => void;
};

function MultiChoice({
  label,
  selected,
  onClick,
}: MultiChoiceProps) {
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
        borderRadius: "10px",
        padding: "10px 13px",
        fontSize: "12px",
        fontWeight: "800",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span
        style={{
          width: "17px",
          height: "17px",
          minWidth: "17px",
          borderRadius: "4px",
          border: selected
            ? "2px solid #4B1678"
            : "1px solid #bcaec6",
          background: selected
            ? "#4B1678"
            : "#ffffff",
          color: "#ffffff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
        }}
      >
        {selected ? "✓" : ""}
      </span>

      {label}
    </button>
  );
}

export default function SellerAddProductPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] =
    useState("");

  const [productType, setProductType] =
    useState<ProductType | null>(null);

  const [features, setFeatures] =
    useState<string[]>([]);

  const [texture, setTexture] =
    useState("");

  const [color, setColor] =
    useState("Natural / 1B");

  const [selectedLengths, setSelectedLengths] =
    useState<string[]>([]);

  const [price, setPrice] =
    useState("");

  const [inventory, setInventory] =
    useState("");

  const [sku, setSku] =
    useState("");

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

  const [extensionPieces, setExtensionPieces] =
    useState("");

  const [braidingMaterial, setBraidingMaterial] =
    useState("");

  const toggleFeature = (value: string) => {
    setFeatures((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  };

  const toggleLength = (value: string) => {
    setSelectedLengths((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  };

  const changeProductType = (
    value: ProductType,
  ) => {
    setProductType(value);
    setFeatures([]);
  };

  const typeLabel = useMemo(
    () =>
      productTypes.find(
        (item) =>
          item.value === productType,
      )?.label || "",
    [productType],
  );

  const requiresHairFields =
    productType &&
    productType !== "HAIR_ESSENTIAL";

  const ready =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    productType !== null &&
    price.trim().length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        padding: "28px 18px 60px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <div
        style={{
          maxWidth: "880px",
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
              justifyContent:
                "space-between",
              gap: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "#7b3fa0",
                  fontSize: "11px",
                  fontWeight: "800",
                  letterSpacing: "1.2px",
                  textTransform:
                    "uppercase",
                }}
              >
                HairGrab Quick Add
              </div>

              <h1
                style={{
                  margin: "5px 0 5px",
                  color: "#4B1678",
                  fontSize: "29px",
                }}
              >
                Add a Product
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "#766d7a",
                  fontSize: "13px",
                }}
              >
                Add the basics first.
                HairGrab only asks for
                details that apply to
                this product.
              </p>
            </div>

            <div
              style={{
                background: "#eef8f0",
                color: "#347143",
                border:
                  "1px solid #cbe3d0",
                padding: "8px 12px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: "800",
              }}
            >
              Goal: under 2 minutes
            </div>
          </div>

          {/* BASIC INFORMATION */}

          <div style={sectionStyle}>
            <h2
              style={{
                margin: "0 0 16px",
                color: "#4B1678",
                fontSize: "19px",
              }}
            >
              Product information
            </h2>

            <div
              style={{
                display: "grid",
                gap: "17px",
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
                  placeholder="Paste or type the product name"
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
                  placeholder="Paste your existing product description"
                  style={{
                    ...fieldStyle,
                    resize: "vertical",
                    fontFamily:
                      "Arial, sans-serif",
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
              What type of product is this?
            </h2>

            <p
              style={{
                margin: "0 0 15px",
                color: "#817787",
                fontSize: "12px",
              }}
            >
              Choose one. HairGrab will
              open the correct product
              template automatically.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "10px",
              }}
            >
              {productTypes.map(
                (item) => {
                  const selected =
                    item.value ===
                    productType;

                  return (
                    <button
                      type="button"
                      key={item.value}
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
                        background:
                          selected
                            ? "#f7f0fb"
                            : "#ffffff",
                        borderRadius:
                          "11px",
                        padding: "14px",
                        cursor: "pointer",
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

          {/* WIG TEMPLATE */}

          {productType === "WIG" && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 5px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Wig details
              </h2>

              <p
                style={{
                  margin: "0 0 15px",
                  color: "#817787",
                  fontSize: "12px",
                }}
              >
                Select everything that
                applies.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "18px",
                }}
              >
                {[
                  ["GLUELESS", "Glueless"],
                  [
                    "CLOSURE_WIG",
                    "Closure Wig",
                  ],
                  [
                    "FRONTAL_WIG",
                    "Frontal Wig",
                  ],
                  [
                    "FULL_LACE",
                    "Full Lace",
                  ],
                  [
                    "HEADBAND",
                    "Headband Wig",
                  ],
                ].map(
                  ([value, label]) => (
                    <MultiChoice
                      key={value}
                      value={value}
                      label={label}
                      selected={features.includes(
                        value,
                      )}
                      onClick={() =>
                        toggleFeature(
                          value,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* BUNDLE TEMPLATE */}

          {productType ===
            "BUNDLE" && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Bundle details
              </h2>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {[
                  [
                    "SINGLE_BUNDLE",
                    "Single Bundle",
                  ],
                  [
                    "BUNDLE_DEAL",
                    "Bundle Deal",
                  ],
                  [
                    "WITH_CLOSURE",
                    "Includes Closure",
                  ],
                  [
                    "WITH_FRONTAL",
                    "Includes Frontal",
                  ],
                ].map(
                  ([value, label]) => (
                    <MultiChoice
                      key={value}
                      value={value}
                      label={label}
                      selected={features.includes(
                        value,
                      )}
                      onClick={() =>
                        toggleFeature(
                          value,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* CLOSURE / FRONTAL */}

          {productType ===
            "CLOSURE_FRONTAL" && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Closure / frontal
                details
              </h2>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {[
                  [
                    "CLOSURE",
                    "Closure",
                  ],
                  [
                    "FRONTAL",
                    "Frontal",
                  ],
                  [
                    "360_FRONTAL",
                    "360 Frontal",
                  ],
                ].map(
                  ([value, label]) => (
                    <MultiChoice
                      key={value}
                      value={value}
                      label={label}
                      selected={features.includes(
                        value,
                      )}
                      onClick={() =>
                        toggleFeature(
                          value,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* EXTENSION TEMPLATE */}

          {productType ===
            "EXTENSION" && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Extension type
              </h2>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {[
                  [
                    "CLIP_IN",
                    "Clip-Ins",
                  ],
                  [
                    "TAPE_IN",
                    "Tape-Ins",
                  ],
                  [
                    "I_TIP",
                    "I-Tips / Microlinks",
                  ],
                  [
                    "PONYTAIL",
                    "Ponytail",
                  ],
                  ["HALO", "Halo"],
                ].map(
                  ([value, label]) => (
                    <MultiChoice
                      key={value}
                      value={value}
                      label={label}
                      selected={features.includes(
                        value,
                      )}
                      onClick={() =>
                        toggleFeature(
                          value,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* BRAIDING */}

          {productType ===
            "BRAIDING_HAIR" && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Braiding hair details
              </h2>

              <div>
                <label style={labelStyle}>
                  Hair Material
                </label>

                <select
                  value={
                    braidingMaterial
                  }
                  onChange={(event) =>
                    setBraidingMaterial(
                      event.target.value,
                    )
                  }
                  style={fieldStyle}
                >
                  <option value="">
                    Select
                  </option>
                  <option>
                    Human Hair
                  </option>
                  <option>
                    Synthetic
                  </option>
                  <option>
                    Human / Synthetic Blend
                  </option>
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "14px",
                }}
              >
                {[
                  [
                    "PRE_STRETCHED",
                    "Pre-Stretched",
                  ],
                  [
                    "BOHO",
                    "Boho / Loose Curl",
                  ],
                ].map(
                  ([value, label]) => (
                    <MultiChoice
                      key={value}
                      value={value}
                      label={label}
                      selected={features.includes(
                        value,
                      )}
                      onClick={() =>
                        toggleFeature(
                          value,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* COMMON HAIR FIELDS */}

          {requiresHairFields && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Hair details
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
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

                <div>
                  <label style={labelStyle}>
                    Color
                  </label>

                  <input
                    value={color}
                    onChange={(event) =>
                      setColor(
                        event.target.value,
                      )
                    }
                    style={fieldStyle}
                  />
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
                  {lengths.map(
                    (length) => {
                      const selected =
                        selectedLengths.includes(
                          length,
                        );

                      return (
                        <button
                          type="button"
                          key={length}
                          onClick={() =>
                            toggleLength(
                              length,
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
                              "8px 11px",
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
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          )}

          {/* OPTIONAL PRODUCT DETAILS */}

          {productType && (
            <details
              style={{
                ...sectionStyle,
                cursor: "pointer",
              }}
            >
              <summary
                style={{
                  color: "#4B1678",
                  fontWeight: "800",
                  fontSize: "15px",
                }}
              >
                Optional product details
              </summary>

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                {productType ===
                  "WIG" && (
                  <>
                    <div>
                      <label
                        style={
                          labelStyle
                        }
                      >
                        Density
                      </label>

                      <select
                        value={density}
                        onChange={(
                          event,
                        ) =>
                          setDensity(
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
                        <option>
                          130%
                        </option>
                        <option>
                          150%
                        </option>
                        <option>
                          180%
                        </option>
                        <option>
                          200%
                        </option>
                        <option>
                          250%
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={
                          labelStyle
                        }
                      >
                        Lace Size
                      </label>

                      <select
                        value={
                          laceSize
                        }
                        onChange={(
                          event,
                        ) =>
                          setLaceSize(
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
                        <option>
                          4x4
                        </option>
                        <option>
                          5x5
                        </option>
                        <option>
                          6x6
                        </option>
                        <option>
                          7x7
                        </option>
                        <option>
                          13x4
                        </option>
                        <option>
                          13x6
                        </option>
                        <option>
                          360
                        </option>
                        <option>
                          Full Lace
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={
                          labelStyle
                        }
                      >
                        Lace Type
                      </label>

                      <select
                        value={
                          laceType
                        }
                        onChange={(
                          event,
                        ) =>
                          setLaceType(
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
                        <option>
                          HD Lace
                        </option>
                        <option>
                          Transparent Lace
                        </option>
                        <option>
                          Swiss Lace
                        </option>
                        <option>
                          Regular Lace
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={
                          labelStyle
                        }
                      >
                        Cap Size
                      </label>

                      <select
                        value={
                          capSize
                        }
                        onChange={(
                          event,
                        ) =>
                          setCapSize(
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
                    <label
                      style={labelStyle}
                    >
                      Bundle Weight
                    </label>

                    <select
                      value={
                        bundleWeight
                      }
                      onChange={(event) =>
                        setBundleWeight(
                          event.target
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

                {productType ===
                  "EXTENSION" && (
                  <div>
                    <label
                      style={labelStyle}
                    >
                      Number of Pieces
                    </label>

                    <input
                      type="number"
                      value={
                        extensionPieces
                      }
                      onChange={(event) =>
                        setExtensionPieces(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Example: 7"
                      style={fieldStyle}
                    />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>
                    SKU
                  </label>

                  <input
                    value={sku}
                    onChange={(event) =>
                      setSku(
                        event.target.value,
                      )
                    }
                    placeholder="Optional"
                    style={fieldStyle}
                  />
                </div>
              </div>
            </details>
          )}

          {/* PRICE */}

          {productType && (
            <div style={sectionStyle}>
              <h2
                style={{
                  margin: "0 0 15px",
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Price & inventory
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Starting Price *
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(event) =>
                      setPrice(
                        event.target.value,
                      )
                    }
                    placeholder="0.00"
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    Inventory
                  </label>

                  <input
                    type="number"
                    value={inventory}
                    onChange={(event) =>
                      setInventory(
                        event.target.value,
                      )
                    }
                    placeholder="Optional"
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* READY */}

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
              Continue to Photos & Variants
            </button>

            <div
              style={{
                marginTop: "9px",
                textAlign: "center",
                color: "#817787",
                fontSize: "11px",
              }}
            >
              {productType
                ? `${typeLabel} template active`
                : "Choose a product type to continue"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}