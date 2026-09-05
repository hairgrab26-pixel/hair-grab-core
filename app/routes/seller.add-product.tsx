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

const subtypes: Record<
  ProductGroup,
  ProductChoice[]
> = {
  WIGS: [
    {
      value: "LACE_WIG",
      label: "Lace Wig",
      description:
        "Front lace, full lace or similar lace construction.",
    },
    {
      value: "GLUELESS_WIG",
      label: "Glueless Wig",
      description:
        "Designed to wear without adhesive.",
    },
    {
      value: "CLOSURE_WIG",
      label: "Closure Wig",
      description:
        "Wig constructed with a lace closure.",
    },
    {
      value: "HEADBAND_WIG",
      label: "Headband Wig",
      description:
        "Wig designed with an attached headband.",
    },
    {
      value: "OTHER_WIG",
      label: "Other Wig",
      description:
        "Another wig construction or style.",
    },
  ],

  BUNDLES: [
    {
      value: "HAIR_BUNDLE",
      label: "Hair Bundle",
      description:
        "Traditional wefted bundle of hair.",
    },
    {
      value: "BUNDLE_DEAL",
      label: "Bundle Deal",
      description:
        "Multiple bundles sold together as a set.",
    },
  ],

  CLOSURES_FRONTALS: [
    {
      value: "CLOSURE",
      label: "Closure",
      description:
        "4x4, 5x5, 6x6, 7x7 and similar lace closures.",
    },
    {
      value: "FRONTAL",
      label: "Frontal",
      description:
        "13x4, 13x6 and similar lace frontals.",
    },
    {
      value: "360_FRONTAL",
      label: "360 Frontal",
      description:
        "Lace piece designed to wrap around the perimeter.",
    },
  ],

  EXTENSIONS: [
    {
      value: "CLIP_IN",
      label: "Clip-Ins",
      description:
        "Reusable extension sets with attached clips.",
    },
    {
      value: "TAPE_IN",
      label: "Tape-Ins",
      description:
        "Extensions installed using adhesive tabs.",
    },
    {
      value: "I_TIP",
      label: "I-Tips / Microlinks",
      description:
        "Individual extensions installed with beads or links.",
    },
    {
      value: "PONYTAIL",
      label: "Ponytail",
      description:
        "Wrap, drawstring or clip-on ponytail extensions.",
    },
    {
      value: "HALO",
      label: "Halo",
      description:
        "Extension worn using a concealed halo wire.",
    },
    {
      value: "OTHER_EXTENSION",
      label: "Other Extension",
      description:
        "Another extension installation method.",
    },
  ],

  BRAIDING_HAIR: [
    {
      value: "HUMAN_BRAIDING_HAIR",
      label: "Human Hair",
      description:
        "Human hair for braids, boho styles and protective styles.",
    },
    {
      value: "SYNTHETIC_BRAIDING_HAIR",
      label: "Synthetic Hair",
      description:
        "Synthetic braiding and protective-style hair.",
    },
    {
      value: "PRE_STRETCHED",
      label: "Pre-Stretched Hair",
      description:
        "Braiding hair prepared for easier installation.",
    },
  ],

  HAIR_ESSENTIALS: [
    {
      value: "HAIR_CARE",
      label: "Hair Care",
      description:
        "Shampoo, conditioner, mousse, oils and treatments.",
    },
    {
      value: "TOOLS",
      label: "Tools",
      description:
        "Combs, brushes, styling tools and installation tools.",
    },
    {
      value: "ACCESSORIES",
      label: "Accessories",
      description:
        "Caps, bands, bonnets, clips and other accessories.",
    },
  ],
};

export default function SellerAddProductPage() {
  const [group, setGroup] =
    useState<ProductGroup | null>(null);

  const [productType, setProductType] =
    useState<string | null>(null);

  const selectGroup = (
    value: ProductGroup,
  ) => {
    setGroup(value);
    setProductType(null);
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
            Choose the closest category.
            HairGrab will show you only the
            product details that apply to
            that type of hair.
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
                What kind of{" "}
                {selectedGroup?.label.toLowerCase()}
                ?
              </h2>

              <p
                style={{
                  margin: "0 0 16px",
                  color: "#817787",
                  fontSize: "12px",
                }}
              >
                This helps HairGrab build
                the right product options
                automatically.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                {subtypes[group].map(
                  (item) => {
                    const selected =
                      productType ===
                      item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setProductType(
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
              disabled={!productType}
              style={{
                width: "100%",
                border: "none",
                borderRadius: "10px",
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "800",
                background: productType
                  ? "#4B1678"
                  : "#c9bdcf",
                color: "#ffffff",
                cursor: productType
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Continue to Product Details
            </button>

            {productType && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: "10px",
                  color: "#817787",
                  fontSize: "11px",
                }}
              >
                Product type selected:{" "}
                <strong>
                  {productType}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}