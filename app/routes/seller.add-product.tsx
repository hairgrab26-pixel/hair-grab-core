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
  icon: string;
}> = [
  {
    value: "WIGS",
    label: "Wigs",
    description:
      "Lace wigs, glueless wigs, closure wigs and more.",
    icon: "◯",
  },
  {
    value: "BUNDLES",
    label: "Bundles",
    description:
      "Human hair bundles and wefted hair.",
    icon: "≋",
  },
  {
    value: "CLOSURES_FRONTALS",
    label: "Closures & Frontals",
    description:
      "Lace closures, frontals and related pieces.",
    icon: "◇",
  },
  {
    value: "EXTENSIONS",
    label: "Extensions",
    description:
      "Clip-ins, tape-ins, microlinks and more.",
    icon: "↕",
  },
  {
    value: "BRAIDING_HAIR",
    label: "Braiding Hair",
    description:
      "Human and synthetic hair for protective styles.",
    icon: "〰",
  },
  {
    value: "HAIR_ESSENTIALS",
    label: "Hair Essentials",
    description:
      "Hair care, tools and accessories.",
    icon: "✦",
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
      description:
        "The wig includes lace construction.",
    },
    {
      value: "GLUELESS",
      label: "Glueless",
      description:
        "Can be worn without adhesive.",
    },
    {
      value: "CLOSURE_WIG",
      label: "Closure Wig",
      description:
        "Constructed with a lace closure.",
    },
    {
      value: "FRONTAL_WIG",
      label: "Frontal Wig",
      description:
        "Constructed with a lace frontal.",
    },
    {
      value: "FULL_LACE",
      label: "Full Lace",
      description:
        "Full lace cap construction.",
    },
    {
      value: "HEADBAND",
      label: "Headband Wig",
      description:
        "Includes or uses a headband-style construction.",
    },
  ],

  BUNDLES: [
    {
      value: "SINGLE_BUNDLE",
      label: "Single Bundle",
      description:
        "One bundle sold individually.",
    },
    {
      value: "BUNDLE_DEAL",
      label: "Bundle Deal",
      description:
        "Multiple bundles sold together.",
    },
    {
      value: "WITH_CLOSURE",
      label: "Includes Closure",
      description:
        "Bundle package includes a closure.",
    },
    {
      value: "WITH_FRONTAL",
      label: "Includes Frontal",
      description:
        "Bundle package includes a frontal.",
    },
  ],

  CLOSURES_FRONTALS: [
    {
      value: "CLOSURE",
      label: "Closure",
      description:
        "4x4, 5x5, 6x6, 7x7 and similar closures.",
    },
    {
      value: "FRONTAL",
      label: "Frontal",
      description:
        "13x4, 13x6 and similar frontals.",
    },
    {
      value: "360_FRONTAL",
      label: "360 Frontal",
      description:
        "Lace designed around the perimeter.",
    },
    {
      value: "HD_LACE",
      label: "HD Lace",
      description:
        "Uses HD lace.",
    },
    {
      value: "TRANSPARENT_LACE",
      label: "Transparent Lace",
      description:
        "Uses transparent lace.",
    },
  ],

  EXTENSIONS: [
    {
      value: "CLIP_IN",
      label: "Clip-Ins",
      description:
        "Reusable extensions with attached clips.",
    },
    {
      value: "TAPE_IN",
      label: "Tape-Ins",
      description:
        "Extensions installed with adhesive tabs.",
    },
    {
      value: "I_TIP",
      label: "I-Tips / Microlinks",
      description:
        "Installed with beads or microlinks.",
    },
    {
      value: "PONYTAIL",
      label: "Ponytail",
      description:
        "Wrap, drawstring or clip-on ponytail.",
    },
    {
      value: "HALO",
      label: "Halo",
      description:
        "Halo-style extension system.",
    },
  ],

  BRAIDING_HAIR: [
    {
      value: "HUMAN_HAIR",
      label: "Human Hair",
      description:
        "Made with human hair.",
    },
    {
      value: "SYNTHETIC",
      label: "Synthetic",
      description:
        "Made with synthetic hair.",
    },
    {
      value: "PRE_STRETCHED",
      label: "Pre-Stretched",
      description:
        "Prepared for easier installation.",
    },
    {
      value: "BOHO",
      label: "Boho / Loose Curl",
      description:
        "Designed for boho or curly braid styles.",
    },
  ],

  HAIR_ESSENTIALS: [
    {
      value: "HAIR_CARE",
      label: "Hair Care",
      description:
        "Shampoo, conditioner, oils and treatments.",
    },
    {
      value: "TOOLS",
      label: "Tools",
      description:
        "Combs, brushes and styling tools.",
    },
    {
      value: "ACCESSORIES",
      label: "Accessories",
      description:
        "Caps, bands, bonnets, clips and more.",
    },
  ],
};

export default function SellerAddProductPage() {
  const [group, setGroup] =
    useState<ProductGroup | null>(null);

  const [selectedFeatures, setSelectedFeatures] =
    useState<string[]>([]);

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

  const selectedGroup =
    productGroups.find(
      (item) => item.value === group,
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

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e6d9ef",
            borderRadius: "18px",
            padding: "26px",
            boxShadow:
              "0 4px 18px rgba(75, 22, 120, 0.07)",
          }}
        >
          <div
            style={{
              color: "#7b3fa0",
              fontSize: "12px",
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: "1.2px",
            }}
          >
            Add Product
          </div>

          <h1
            style={{
              margin: "7px 0 8px",
              color: "#4B1678",
              fontSize: "30px",
            }}
          >
            What are you selling?
          </h1>

          <p
            style={{
              margin: "0 0 24px",
              color: "#706776",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            Choose the main category first.
            Then select every feature that
            applies to this product.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "14px",
            }}
          >
            {productGroups.map((item) => {
              const selected =
                group === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    selectGroup(item.value)
                  }
                  style={{
                    textAlign: "left",
                    padding: "18px",
                    borderRadius: "14px",
                    border: selected
                      ? "2px solid #4B1678"
                      : "1px solid #ded3e5",
                    background: selected
                      ? "#f7f0fb"
                      : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: "22px",
                      color: "#4B1678",
                      marginBottom: "9px",
                    }}
                  >
                    {item.icon}
                  </div>

                  <div
                    style={{
                      color: "#4B1678",
                      fontSize: "16px",
                      fontWeight: "800",
                    }}
                  >
                    {item.label}
                  </div>

                  <div
                    style={{
                      color: "#776e7b",
                      fontSize: "12px",
                      lineHeight: "1.5",
                      marginTop: "5px",
                    }}
                  >
                    {item.description}
                  </div>
                </button>
              );
            })}
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
                  margin: "0 0 6px",
                  color: "#4B1678",
                  fontSize: "21px",
                }}
              >
                Select all that apply
              </h2>

              <p
                style={{
                  margin: "0 0 16px",
                  color: "#817787",
                  fontSize: "12px",
                }}
              >
                This product is in{" "}
                <strong>
                  {selectedGroup?.label}
                </strong>
                . Choose as many features
                as needed.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                {features[group].map(
                  (item) => {
                    const selected =
                      selectedFeatures.includes(
                        item.value,
                      );

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          toggleFeature(
                            item.value,
                          )
                        }
                        style={{
                          textAlign: "left",
                          padding: "15px",
                          borderRadius: "12px",
                          border: selected
                            ? "2px solid #4B1678"
                            : "1px solid #ded3e5",
                          background: selected
                            ? "#f7f0fb"
                            : "#ffffff",
                          cursor: "pointer",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems:
                              "flex-start",
                          }}
                        >
                          <div
                            style={{
                              width: "19px",
                              height: "19px",
                              minWidth: "19px",
                              borderRadius: "5px",
                              border: selected
                                ? "2px solid #4B1678"
                                : "1px solid #bcaec6",
                              background: selected
                                ? "#4B1678"
                                : "#ffffff",
                              color: "#ffffff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent:
                                "center",
                              fontSize: "12px",
                              fontWeight: "800",
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
                              {item.label}
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
                  },
                )}
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
              style={{
                width: "100%",
                border: "none",
                borderRadius: "10px",
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "800",
                background: group
                  ? "#4B1678"
                  : "#c9bdcf",
                color: "#ffffff",
                cursor: group
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Continue to Product Details
            </button>

            {group && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: "10px",
                  color: "#817787",
                  fontSize: "11px",
                }}
              >
                {selectedFeatures.length}{" "}
                feature
                {selectedFeatures.length ===
                1
                  ? ""
                  : "s"}{" "}
                selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}