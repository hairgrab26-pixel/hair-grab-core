import { useState } from "react";

type ProductGroup =
  | "WIGS"
  | "BUNDLES"
  | "CLOSURES_FRONTALS"
  | "EXTENSIONS"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIALS";

type ProductChoice = {
  value: string;
  label: string;
  description: string;
};

const productGroups: Array<{
  value: ProductGroup;
  label: string;
  description: string;
}> = [
  {
    value: "WIGS",
    label: "Wigs",
    description:
      "Lace wigs, glueless wigs, closure wigs and more.",
  },
  {
    value: "BUNDLES",
    label: "Bundles",
    description:
      "Human hair bundles, wefts and bundle deals.",
  },
  {
    value: "CLOSURES_FRONTALS",
    label: "Closures & Frontals",
    description:
      "Lace closures, frontals and related pieces.",
  },
  {
    value: "EXTENSIONS",
    label: "Extensions",
    description:
      "Clip-ins, tape-ins, microlinks, ponytails and more.",
  },
  {
    value: "BRAIDING_HAIR",
    label: "Braiding Hair",
    description:
      "Human and synthetic hair for protective styles.",
  },
  {
    value: "HAIR_ESSENTIALS",
    label: "Hair Essentials",
    description:
      "Hair care, tools and accessories.",
  },
];

const features: Record<
  ProductGroup,
  ProductChoice[]
> = {
  WIGS: [
    {
      value: "LACE",
      label: "Lace",
      description: "Includes lace construction.",
    },
    {
      value: "GLUELESS",
      label: "Glueless",
      description: "Can be worn without adhesive.",
    },
    {
      value: "CLOSURE_WIG",
      label: "Closure Wig",
      description: "Constructed using a closure.",
    },
    {
      value: "FRONTAL_WIG",
      label: "Frontal Wig",
      description: "Constructed using a frontal.",
    },
    {
      value: "FULL_LACE",
      label: "Full Lace",
      description: "Full lace construction.",
    },
    {
      value: "HEADBAND",
      label: "Headband Wig",
      description: "Headband-style construction.",
    },
  ],

  BUNDLES: [
    {
      value: "SINGLE_BUNDLE",
      label: "Single Bundle",
      description: "One bundle sold individually.",
    },
    {
      value: "BUNDLE_DEAL",
      label: "Bundle Deal",
      description: "Multiple bundles sold together.",
    },
    {
      value: "WITH_CLOSURE",
      label: "Includes Closure",
      description: "Package includes a closure.",
    },
    {
      value: "WITH_FRONTAL",
      label: "Includes Frontal",
      description: "Package includes a frontal.",
    },
  ],

  CLOSURES_FRONTALS: [
    {
      value: "CLOSURE",
      label: "Closure",
      description: "4x4, 5x5, 6x6, 7x7 and similar.",
    },
    {
      value: "FRONTAL",
      label: "Frontal",
      description: "13x4, 13x6 and similar.",
    },
    {
      value: "360_FRONTAL",
      label: "360 Frontal",
      description: "Perimeter lace construction.",
    },
    {
      value: "HD_LACE",
      label: "HD Lace",
      description: "Uses HD lace.",
    },
    {
      value: "TRANSPARENT_LACE",
      label: "Transparent Lace",
      description: "Uses transparent lace.",
    },
  ],

  EXTENSIONS: [
    {
      value: "CLIP_IN",
      label: "Clip-Ins",
      description: "Extensions with attached clips.",
    },
    {
      value: "TAPE_IN",
      label: "Tape-Ins",
      description: "Installed using adhesive tabs.",
    },
    {
      value: "I_TIP",
      label: "I-Tips / Microlinks",
      description: "Installed with beads or microlinks.",
    },
    {
      value: "PONYTAIL",
      label: "Ponytail",
      description: "Wrap, drawstring or clip-on ponytail.",
    },
    {
      value: "HALO",
      label: "Halo",
      description: "Halo-style extension system.",
    },
  ],

  BRAIDING_HAIR: [
    {
      value: "HUMAN_HAIR",
      label: "Human Hair",
      description: "Made with human hair.",
    },
    {
      value: "SYNTHETIC",
      label: "Synthetic",
      description: "Made with synthetic fibers.",
    },
    {
      value: "PRE_STRETCHED",
      label: "Pre-Stretched",
      description: "Prepared for easier installation.",
    },
    {
      value: "BOHO",
      label: "Boho / Loose Curl",
      description: "For boho and curly braid styles.",
    },
  ],

  HAIR_ESSENTIALS: [
    {
      value: "HAIR_CARE",
      label: "Hair Care",
      description: "Shampoo, conditioner, oils and treatments.",
    },
    {
      value: "TOOLS",
      label: "Tools",
      description: "Combs, brushes and styling tools.",
    },
    {
      value: "ACCESSORIES",
      label: "Accessories",
      description: "Caps, bands, bonnets, clips and more.",
    },
  ],
};

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

const hairLengths = [
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

const capSizes = [
  "Small",
  "Medium",
  "Large",
  "Adjustable",
];

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d8cce0",
  borderRadius: "10px",
  padding: "12px 13px",
  fontSize: "14px",
  background: "#ffffff",
  color: "#21152a",
};

const labelStyle = {
  display: "block",
  color: "#4B1678",
  fontSize: "13px",
  fontWeight: "800",
  marginBottom: "7px",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6d9ef",
  borderRadius: "18px",
  padding: "26px",
  boxShadow:
    "0 4px 18px rgba(75, 22, 120, 0.07)",
};

export default function SellerAddProductPage() {
  const [step, setStep] = useState<1 | 2>(1);

  const [group, setGroup] =
    useState<ProductGroup | null>(null);

  const [selectedFeatures, setSelectedFeatures] =
    useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] =
    useState("");

  const [texture, setTexture] = useState("");
  const [color, setColor] = useState("Natural Black / 1B");

  const [selectedLengths, setSelectedLengths] =
    useState<string[]>([]);

  const [density, setDensity] = useState("");
  const [laceSize, setLaceSize] = useState("");
  const [laceType, setLaceType] = useState("");
  const [capSize, setCapSize] = useState("");

  const [bundleWeight, setBundleWeight] =
    useState("100g");

  const [pieceCount, setPieceCount] =
    useState("");

  const [basePrice, setBasePrice] =
    useState("");

  const [sku, setSku] = useState("");

  const [inventory, setInventory] =
    useState("");

  const selectGroup = (
    value: ProductGroup,
  ) => {
    setGroup(value);
    setSelectedFeatures([]);
  };

  const toggleFeature = (
    value: string,
  ) => {
    setSelectedFeatures((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  };

  const toggleLength = (
    length: string,
  ) => {
    setSelectedLengths((current) =>
      current.includes(length)
        ? current.filter(
            (item) => item !== length,
          )
        : [...current, length],
    );
  };

  const selectedGroup =
    productGroups.find(
      (item) => item.value === group,
    );

  const isWig =
    group === "WIGS";

  const isBundles =
    group === "BUNDLES";

  const isClosureOrFrontal =
    group === "CLOSURES_FRONTALS";

  const isExtensions =
    group === "EXTENSIONS";

  const isBraiding =
    group === "BRAIDING_HAIR";

  const isEssentials =
    group === "HAIR_ESSENTIALS";

  const showLace =
    isWig ||
    isClosureOrFrontal ||
    selectedFeatures.includes(
      "WITH_CLOSURE",
    ) ||
    selectedFeatures.includes(
      "WITH_FRONTAL",
    );

  const showDensity =
    isWig;

  const showCapSize =
    isWig;

  const showBundleWeight =
    isBundles;

  const showPieceCount =
    selectedFeatures.includes(
      "CLIP_IN",
    );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        padding: "30px 18px 60px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          <img
            src="/hairgrab-logo.png"
            alt="HairGrab"
            style={{
              width: "250px",
              maxWidth: "75%",
              height: "auto",
            }}
          />
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "18px",
            }}
          >
            <div>
              <div
                style={{
                  color: "#7b3fa0",
                  fontSize: "12px",
                  fontWeight: "800",
                  textTransform:
                    "uppercase",
                  letterSpacing: "1.2px",
                }}
              >
                Add Product
              </div>

              <h1
                style={{
                  margin: "6px 0 0",
                  color: "#4B1678",
                  fontSize: "30px",
                }}
              >
                {step === 1
                  ? "What are you selling?"
                  : "Product Details"}
              </h1>
            </div>

            <div
              style={{
                background: "#f5eef9",
                color: "#4B1678",
                borderRadius: "20px",
                padding: "7px 12px",
                fontSize: "11px",
                fontWeight: "800",
              }}
            >
              Step {step} of 2
            </div>
          </div>

          {step === 1 && (
            <>
              <p
                style={{
                  margin: "0 0 24px",
                  color: "#706776",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                Choose the main category.
                Then select every feature
                that applies to the
                product.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "14px",
                }}
              >
                {productGroups.map(
                  (item) => {
                    const selected =
                      group ===
                      item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          selectGroup(
                            item.value,
                          )
                        }
                        style={{
                          textAlign:
                            "left",
                          padding:
                            "18px",
                          borderRadius:
                            "14px",
                          border:
                            selected
                              ? "2px solid #4B1678"
                              : "1px solid #ded3e5",
                          background:
                            selected
                              ? "#f7f0fb"
                              : "#ffffff",
                          cursor:
                            "pointer",
                        }}
                      >
                        <div
                          style={{
                            color:
                              "#4B1678",
                            fontSize:
                              "16px",
                            fontWeight:
                              "800",
                          }}
                        >
                          {item.label}
                        </div>

                        <div
                          style={{
                            color:
                              "#776e7b",
                            fontSize:
                              "12px",
                            lineHeight:
                              "1.5",
                            marginTop:
                              "5px",
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

              {group && (
                <div
                  style={{
                    marginTop: "28px",
                    paddingTop: "25px",
                    borderTop:
                      "1px solid #eee7f2",
                  }}
                >
                  <h2
                    style={{
                      margin:
                        "0 0 5px",
                      color:
                        "#4B1678",
                      fontSize:
                        "21px",
                    }}
                  >
                    Select all that
                    apply
                  </h2>

                  <p
                    style={{
                      margin:
                        "0 0 16px",
                      color:
                        "#817787",
                      fontSize:
                        "12px",
                    }}
                  >
                    Category:{" "}
                    <strong>
                      {
                        selectedGroup?.label
                      }
                    </strong>
                  </p>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {features[
                      group
                    ].map((item) => {
                      const selected =
                        selectedFeatures.includes(
                          item.value,
                        );

                      return (
                        <button
                          key={
                            item.value
                          }
                          type="button"
                          onClick={() =>
                            toggleFeature(
                              item.value,
                            )
                          }
                          style={{
                            textAlign:
                              "left",
                            padding:
                              "15px",
                            borderRadius:
                              "12px",
                            border:
                              selected
                                ? "2px solid #4B1678"
                                : "1px solid #ded3e5",
                            background:
                              selected
                                ? "#f7f0fb"
                                : "#ffffff",
                            cursor:
                              "pointer",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              gap:
                                "10px",
                            }}
                          >
                            <div
                              style={{
                                width:
                                  "19px",
                                height:
                                  "19px",
                                minWidth:
                                  "19px",
                                borderRadius:
                                  "5px",
                                border:
                                  selected
                                    ? "2px solid #4B1678"
                                    : "1px solid #bcaec6",
                                background:
                                  selected
                                    ? "#4B1678"
                                    : "#ffffff",
                                color:
                                  "#ffffff",
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                fontWeight:
                                  "800",
                              }}
                            >
                              {selected
                                ? "✓"
                                : ""}
                            </div>

                            <div>
                              <div
                                style={{
                                  color:
                                    "#4B1678",
                                  fontSize:
                                    "14px",
                                  fontWeight:
                                    "800",
                                }}
                              >
                                {
                                  item.label
                                }
                              </div>

                              <div
                                style={{
                                  color:
                                    "#776e7b",
                                  fontSize:
                                    "11px",
                                  lineHeight:
                                    "1.45",
                                  marginTop:
                                    "4px",
                                }}
                              >
                                {
                                  item.description
                                }
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: "28px",
                  paddingTop: "22px",
                  borderTop:
                    "1px solid #eee7f2",
                }}
              >
                <button
                  type="button"
                  disabled={!group}
                  onClick={() =>
                    group &&
                    setStep(2)
                  }
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius:
                      "10px",
                    padding:
                      "14px 18px",
                    fontSize:
                      "14px",
                    fontWeight:
                      "800",
                    background:
                      group
                        ? "#4B1678"
                        : "#c9bdcf",
                    color:
                      "#ffffff",
                    cursor:
                      group
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  Continue to Product
                  Details
                </button>
              </div>
            </>
          )}

          {step === 2 && group && (
            <>
              <div
                style={{
                  background: "#f7f0fb",
                  border:
                    "1px solid #e2d4eb",
                  borderRadius: "12px",
                  padding: "14px",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    color: "#4B1678",
                    fontSize: "13px",
                    fontWeight: "800",
                  }}
                >
                  {selectedGroup?.label}
                </div>

                {selectedFeatures.length >
                  0 && (
                  <div
                    style={{
                      color: "#766d7a",
                      fontSize: "11px",
                      marginTop: "5px",
                    }}
                  >
                    {
                      selectedFeatures.join(
                        " • ",
                      )
                    }
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Product Name
                  </label>

                  <input
                    value={title}
                    onChange={(e) =>
                      setTitle(
                        e.target.value,
                      )
                    }
                    placeholder="Example: Burmese Body Wave Glueless Wig"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                {!isEssentials && (
                  <>
                    <div>
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
                        onChange={(e) =>
                          setTexture(
                            e.target
                              .value,
                          )
                        }
                        style={
                          fieldStyle
                        }
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

                    <div>
                      <label
                        style={
                          labelStyle
                        }
                      >
                        Hair Color
                      </label>

                      <input
                        value={
                          color
                        }
                        onChange={(e) =>
                          setColor(
                            e.target
                              .value,
                          )
                        }
                        placeholder="Natural Black / 1B"
                        style={
                          fieldStyle
                        }
                      />
                    </div>
                  </>
                )}

                {showDensity && (
                  <div>
                    <label
                      style={
                        labelStyle
                      }
                    >
                      Density
                    </label>

                    <select
                      value={
                        density
                      }
                      onChange={(e) =>
                        setDensity(
                          e.target.value,
                        )
                      }
                      style={
                        fieldStyle
                      }
                    >
                      <option value="">
                        Select density
                      </option>

                      {densities.map(
                        (item) => (
                          <option
                            key={item}
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
                )}

                {showLace && (
                  <>
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
                        onChange={(e) =>
                          setLaceSize(
                            e.target
                              .value,
                          )
                        }
                        style={
                          fieldStyle
                        }
                      >
                        <option value="">
                          Select lace size
                        </option>

                        {laceSizes.map(
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
                        onChange={(e) =>
                          setLaceType(
                            e.target
                              .value,
                          )
                        }
                        style={
                          fieldStyle
                        }
                      >
                        <option value="">
                          Select lace type
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
                  </>
                )}

                {showCapSize && (
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
                      onChange={(e) =>
                        setCapSize(
                          e.target.value,
                        )
                      }
                      style={
                        fieldStyle
                      }
                    >
                      <option value="">
                        Select cap size
                      </option>

                      {capSizes.map(
                        (item) => (
                          <option
                            key={item}
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
                )}

                {showBundleWeight && (
                  <div>
                    <label
                      style={
                        labelStyle
                      }
                    >
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
                      style={
                        fieldStyle
                      }
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

                {showPieceCount && (
                  <div>
                    <label
                      style={
                        labelStyle
                      }
                    >
                      Number of Pieces
                    </label>

                    <input
                      type="number"
                      value={
                        pieceCount
                      }
                      onChange={(e) =>
                        setPieceCount(
                          e.target
                            .value,
                        )
                      }
                      placeholder="Example: 7"
                      style={
                        fieldStyle
                      }
                    />
                  </div>
                )}

                {!isEssentials && (
                  <div
                    style={{
                      gridColumn:
                        "1 / -1",
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
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      {hairLengths.map(
                        (length) => {
                          const selected =
                            selectedLengths.includes(
                              length,
                            );

                          return (
                            <button
                              key={
                                length
                              }
                              type="button"
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
                                  "9px",
                                padding:
                                  "9px 13px",
                                fontWeight:
                                  "800",
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

                    <div
                      style={{
                        marginTop:
                          "7px",
                        fontSize:
                          "11px",
                        color:
                          "#817787",
                      }}
                    >
                      Select every
                      length offered.
                      HairGrab will
                      eventually turn
                      these into
                      variants instead
                      of separate
                      products.
                    </div>
                  </div>
                )}

                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Starting Price
                  </label>

                  <input
                    type="number"
                    value={
                      basePrice
                    }
                    onChange={(e) =>
                      setBasePrice(
                        e.target.value,
                      )
                    }
                    placeholder="0.00"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    SKU
                  </label>

                  <input
                    value={sku}
                    onChange={(e) =>
                      setSku(
                        e.target.value,
                      )
                    }
                    placeholder="Optional"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Inventory
                  </label>

                  <input
                    type="number"
                    value={
                      inventory
                    }
                    onChange={(e) =>
                      setInventory(
                        e.target.value,
                      )
                    }
                    placeholder="0"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                <div
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Product Description
                  </label>

                  <textarea
                    value={
                      description
                    }
                    onChange={(e) =>
                      setDescription(
                        e.target.value,
                      )
                    }
                    placeholder="Tell shoppers about this product..."
                    rows={6}
                    style={{
                      ...fieldStyle,
                      resize:
                        "vertical",
                      fontFamily:
                        "Arial, sans-serif",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: "28px",
                  paddingTop: "22px",
                  borderTop:
                    "1px solid #eee7f2",
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setStep(1)
                  }
                  style={{
                    flex: "1",
                    minWidth: "180px",
                    border:
                      "1px solid #4B1678",
                    background:
                      "#ffffff",
                    color:
                      "#4B1678",
                    borderRadius:
                      "10px",
                    padding:
                      "14px 18px",
                    fontWeight:
                      "800",
                    cursor:
                      "pointer",
                  }}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  style={{
                    flex: "2",
                    minWidth: "220px",
                    border: "none",
                    background:
                      "#4B1678",
                    color:
                      "#ffffff",
                    borderRadius:
                      "10px",
                    padding:
                      "14px 18px",
                    fontWeight:
                      "800",
                    cursor:
                      "pointer",
                  }}
                >
                  Continue to Variants &
                  Pricing
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}