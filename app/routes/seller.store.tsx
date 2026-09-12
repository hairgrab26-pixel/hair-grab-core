import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const [
    activeProducts,
    featuredProducts,
  ] =
    await Promise.all([
      db.sellerProduct.count({
        where: {
          sellerId:
            seller.id,
          status:
            "ACTIVE",
        },
      }),

      db.sellerHomepagePick.count({
        where: {
          sellerId:
            seller.id,
        },
      }),
    ]);

  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,

      storeSlug:
        seller.storeSlug ||
        "",

      storeDescription:
        seller.storeDescription ||
        "",

      logoUrl:
        seller.logoUrl ||
        "",

      bannerUrl:
        seller.bannerUrl ||
        "",

      city:
        seller.city ||
        "",

      state:
        seller.state ||
        "",

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
    },

    stats: {
      activeProducts,
      featuredProducts,
    },
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const formData =
    await request.formData();

  const storeDescription =
    String(
      formData.get(
        "storeDescription",
      ) || "",
    ).trim();

  if (
    storeDescription.length >
    600
  ) {
    return {
      success:
        false,

      message:
        "Keep your About the Brand section to 600 characters or less.",
    };
  }

  const returnPolicy =
    String(
      formData.get(
        "returnPolicy",
      ) ||
        "14_DAY_RETURNS",
    );

  const allowedPolicies =
    [
      "14_DAY_RETURNS",
      "FINAL_SALE",
    ];

  if (
    !allowedPolicies.includes(
      returnPolicy,
    )
  ) {
    return {
      success:
        false,

      message:
        "Please choose a valid HairGrab return policy.",
    };
  }

  await db.seller.update({
    where: {
      id:
        seller.id,
    },

    data: {
      storeDescription:
        storeDescription ||
        null,

      logoUrl:
        String(
          formData.get(
            "logoUrl",
          ) || "",
        ).trim() ||
        null,

      bannerUrl:
        String(
          formData.get(
            "bannerUrl",
          ) || "",
        ).trim() ||
        null,

      sellsNationwide:
        formData.get(
          "sellsNationwide",
        ) === "on",

      offersLocalPickup:
        formData.get(
          "offersLocalPickup",
        ) === "on",

      offersLocalDelivery:
        formData.get(
          "offersLocalDelivery",
        ) === "on",

      offersSameDayDelivery:
        formData.get(
          "offersSameDayDelivery",
        ) === "on",

      returnPolicy,
    },
  });

  return {
    success:
      true,

    message:
      "Your HairGrab storefront settings were saved.",
  };
};


export default function SellerStorePage() {
  const {
    seller,
    stats,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#F7F2FA",

        color:
          "#21152a",

        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .hg-store-header {
            padding: 18px 16px !important;
          }

          .hg-store-main {
            padding: 20px 14px 60px !important;
          }

          .hg-store-top {
            align-items: flex-start !important;
          }

          .hg-store-title {
            font-size: 27px !important;
          }

          .hg-store-grid {
            grid-template-columns: 1fr !important;
          }

          .hg-store-system-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .hg-store-preview-button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>

      <header
        className="hg-store-header"
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "20px 22px",
        }}
      >
        <div
          style={{
            maxWidth:
              "1050px",

            margin:
              "0 auto",

            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "14px",

            flexWrap:
              "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "10px",

                fontWeight:
                  800,

                letterSpacing:
                  "1px",

                opacity:
                  0.82,
              }}
            >
              HAIRGRAB SELLER
            </div>

            <div
              style={{
                fontSize:
                  "22px",

                fontWeight:
                  900,

                marginTop:
                  "3px",
              }}
            >
              Storefront
            </div>
          </div>

          <Link
            to="/seller"
            style={{
              color:
                "white",

              textDecoration:
                "none",

              fontWeight:
                800,

              fontSize:
                "12px",
            }}
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main
        className="hg-store-main"
        style={{
          maxWidth:
            "1050px",

          margin:
            "0 auto",

          padding:
            "28px 20px 70px",
        }}
      >
        <div
          className="hg-store-top"
          style={{
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "18px",

            flexWrap:
              "wrap",

            marginBottom:
              "22px",
          }}
        >
          <div>
            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "12px",

                fontWeight:
                  800,
              }}
            >
              {seller.sellerCode}
            </div>

            <h1
              className="hg-store-title"
              style={{
                margin:
                  "5px 0 5px",

                color:
                  "#4B1678",

                fontSize:
                  "34px",

                lineHeight:
                  1.08,
              }}
            >
              Build Your Store
            </h1>

            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "13px",

                lineHeight:
                  1.5,

                maxWidth:
                  "650px",
              }}
            >
              HairGrab builds the storefront for you. Add your brand details, choose your policies, and your products are organized automatically.
            </div>
          </div>

          <Link
            className="hg-store-preview-button"
            to="/seller/store-preview"
            style={{
              display:
                "inline-flex",

              alignItems:
                "center",

              background:
                "#4B1678",

              color:
                "white",

              textDecoration:
                "none",

              borderRadius:
                "10px",

              padding:
                "12px 16px",

              fontSize:
                "12px",

              fontWeight:
                900,

              boxShadow:
                "0 5px 14px rgba(75,22,120,.15)",
            }}
          >
            Preview Store →
          </Link>
        </div>

        {actionData && (
          <Notice
            success={
              actionData.success
            }
            text={
              actionData.message
            }
          />
        )}

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",

            gap:
              "10px",

            margin:
              "18px 0 22px",
          }}
          className="hg-store-system-grid"
        >
          <MiniStat
            value={
              String(
                stats.activeProducts,
              )
            }
            label="Active Products"
          />

          <MiniStat
            value={
              String(
                stats.featuredProducts,
              )
            }
            label="Seller Picks"
          />

          <MiniStat
            value="Automatic"
            label="Store Collections"
          />
        </div>

        <Form method="post">
          <div
            className="hg-store-grid"
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr 1fr",

              gap:
                "16px",
            }}
          >
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
                help="Tell shoppers what makes your business special. Keep it short and easy to scan."
              />

              <Field
                label="Logo Image URL"
                name="logoUrl"
                defaultValue={
                  seller.logoUrl
                }
                help="Your existing storefront logo stays in place unless you change it."
              />

              <Field
                label="Hero / Banner Image URL"
                name="bannerUrl"
                defaultValue={
                  seller.bannerUrl
                }
                help="Wide brand or lifestyle image shown at the top of your store."
              />
            </Card>

            <Card
              title="Collections"
              subtitle="HairGrab organizes the basics automatically."
            >
              <SystemCollection
                title="All Products"
                text="Every active product in your HairGrab catalog."
              />

              <SystemCollection
                title="New Arrivals"
                text="Recently added active products automatically appear here."
              />

              <SystemCollection
                title="On Sale"
                text="Products with an active compare-at sale price appear here automatically."
              />

              <SystemCollection
                title="Featured"
                text="Your Seller Picks appear as featured products in your store."
              />

              <InfoBox>
                Custom seller collections such as Glueless Wigs, Raw Hair, Curly Collection, or Under $200 are the next storefront data feature. HairGrab will keep them simple: name the collection, optional image, select products.
              </InfoBox>
            </Card>

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
                    marginTop:
                      "12px",

                    color:
                      "#756b79",

                    fontSize:
                      "11px",
                  }}
                >
                  Store location shown to shoppers:{" "}
                  {[
                    seller.city,
                    seller.state,
                  ]
                    .filter(
                      Boolean,
                    )
                    .join(
                      ", ",
                    )}
                </div>
              )}
            </Card>

            <Card
              title="Returns & Buyer Protection"
              subtitle="Simple, consistent HairGrab choices."
            >
              <label
                style={{
                  display:
                    "block",
                }}
              >
                <div
                  style={
                    labelStyle
                  }
                >
                  Return Policy
                </div>

                <select
                  name="returnPolicy"
                  defaultValue={
                    seller.returnPolicy
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="14_DAY_RETURNS">
                    14-Day Returns
                  </option>

                  <option value="FINAL_SALE">
                    Final Sale
                  </option>
                </select>
              </label>

              <InfoBox>
                HairGrab buyer protection still applies to wrong, damaged, counterfeit, materially misrepresented, and qualifying non-delivery issues.
              </InfoBox>
            </Card>

            <Card
              title="Reviews"
              subtitle="Product reviews and seller reputation stay separate."
            >
              <ReviewRule
                title="Product Reviews"
                text='Products with no HairGrab reviews display "New on HairGrab" instead of empty stars.'
              />

              <ReviewRule
                title="Seller Reviews"
                text="Your store will have its own seller reputation section separate from individual product ratings."
              />

              <ReviewRule
                title="Verified Purchase"
                text="HairGrab reviews will be tied to verified marketplace purchases when review submission is activated."
              />

              <InfoBox>
                We are not importing or faking outside reviews as HairGrab reviews.
              </InfoBox>
            </Card>

            <Card
              title="Store Gallery"
              subtitle="Brand and lifestyle media for your HairGrab storefront."
            >
              <InfoBox>
                Your hero banner is already active. The full drag-and-reorder gallery and reusable storefront media library will be added with the custom collections/media data update so sellers do not have to upload the same image twice.
              </InfoBox>

              <div
                style={{
                  marginTop:
                    "12px",

                  padding:
                    "14px",

                  border:
                    "1px dashed #cfb8df",

                  borderRadius:
                    "11px",

                  color:
                    "#6f6575",

                  fontSize:
                    "12px",

                  textAlign:
                    "center",
                }}
              >
                Gallery images + product/brand video
              </div>
            </Card>

            <Card
              title="Store Navigation"
              subtitle="Built automatically for every seller."
            >
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
                {[
                  "Home",
                  "Shop",
                  "Collections",
                  "About",
                  "Reviews",
                  "Policies",
                ].map(
                  (
                    item,
                  ) => (
                    <span
                      key={
                        item
                      }
                      style={{
                        background:
                          "#f2eafa",

                        color:
                          "#4B1678",

                        border:
                          "1px solid #e2d1ef",

                        borderRadius:
                          "999px",

                        padding:
                          "7px 10px",

                        fontSize:
                          "10px",

                        fontWeight:
                          800,
                      }}
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>

              <InfoBox>
                Sellers do not build menus or pages. HairGrab creates this structure automatically.
              </InfoBox>
            </Card>
          </div>

          <div
            style={{
              position:
                "sticky",

              bottom:
                "12px",

              marginTop:
                "18px",

              background:
                "rgba(247,242,250,.94)",

              backdropFilter:
                "blur(8px)",

              border:
                "1px solid #e2d1ef",

              borderRadius:
                "13px",

              padding:
                "10px",

              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",

              gap:
                "10px",

              flexWrap:
                "wrap",
            }}
          >
            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "11px",
              }}
            >
              Changes update your HairGrab storefront.
            </div>

            <button
              type="submit"
              style={
                saveButton
              }
            >
              Save Storefront
            </button>
          </div>
        </Form>
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
  children:
    React.ReactNode;
}) {
  return (
    <section
      style={{
        background:
          "white",

        border:
          "1px solid #e5dce9",

        borderRadius:
          "15px",

        padding:
          "18px",

        boxShadow:
          "0 3px 12px rgba(45,27,54,.035)",
      }}
    >
      <h2
        style={{
          margin:
            0,

          color:
            "#4B1678",

          fontSize:
            "17px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "11px",

          lineHeight:
            1.45,

          marginTop:
            "4px",

          marginBottom:
            "14px",
        }}
      >
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
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  multiline?: boolean;
  help?: string;
  placeholder?: string;
}) {
  return (
    <label
      style={{
        display:
          "block",

        marginTop:
          "13px",
      }}
    >
      <div
        style={
          labelStyle
        }
      >
        {label}
      </div>

      {multiline ? (
        <textarea
          name={name}
          defaultValue={
            defaultValue
          }
          rows={5}
          placeholder={
            placeholder
          }
          style={{
            ...fieldStyle,
            resize:
              "vertical",
          }}
        />
      ) : (
        <input
          name={name}
          defaultValue={
            defaultValue
          }
          placeholder={
            placeholder
          }
          style={
            fieldStyle
          }
        />
      )}

      {help && (
        <div
          style={{
            color:
              "#817686",

            fontSize:
              "10px",

            lineHeight:
              1.45,

            marginTop:
              "5px",
          }}
        >
          {help}
        </div>
      )}
    </label>
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
    <label
      style={{
        display:
          "flex",

        alignItems:
          "center",

        gap:
          "10px",

        padding:
          "10px 0",

        borderBottom:
          "1px solid #f0e9f3",

        cursor:
          "pointer",
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={
          defaultChecked
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

      <span
        style={{
          fontSize:
            "12px",

          fontWeight:
            800,

          color:
            "#35263e",
        }}
      >
        {label}
      </span>
    </label>
  );
}


function SystemCollection({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        padding:
          "10px 0",

        borderBottom:
          "1px solid #f0e9f3",
      }}
    >
      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          gap:
            "10px",
        }}
      >
        <div
          style={{
            fontWeight:
              900,

            fontSize:
              "12px",

            color:
              "#35263e",
          }}
        >
          {title}
        </div>

        <span
          style={{
            background:
              "#edf8ef",

            color:
              "#28743b",

            borderRadius:
              "999px",

            padding:
              "4px 7px",

            fontSize:
              "9px",

            fontWeight:
              900,
          }}
        >
          AUTO
        </span>
      </div>

      <div
        style={{
          marginTop:
            "4px",

          color:
            "#817686",

          fontSize:
            "10px",

          lineHeight:
            1.45,
        }}
      >
        {text}
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
        padding:
          "10px 0",

        borderBottom:
          "1px solid #f0e9f3",
      }}
    >
      <div
        style={{
          color:
            "#35263e",

          fontSize:
            "12px",

          fontWeight:
            900,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color:
            "#817686",

          fontSize:
            "10px",

          lineHeight:
            1.45,

          marginTop:
            "4px",
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
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop:
          "13px",

        background:
          "#F7F2FA",

        border:
          "1px solid #e2d1ef",

        borderRadius:
          "10px",

        padding:
          "10px",

        color:
          "#6f6575",

        fontSize:
          "10px",

        lineHeight:
          1.5,
      }}
    >
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
        background:
          "white",

        border:
          "1px solid #e5dce9",

        borderRadius:
          "12px",

        padding:
          "13px",

        textAlign:
          "center",
      }}
    >
      <div
        style={{
          color:
            "#4B1678",

          fontSize:
            "17px",

          fontWeight:
            900,

          lineHeight:
            1.1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "9px",

          marginTop:
            "4px",

          fontWeight:
            700,
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
        background:
          success
            ? "#edf8ef"
            : "#fff0f0",

        color:
          success
            ? "#28743b"
            : "#9b2c2c",

        border:
          success
            ? "1px solid #cdebd2"
            : "1px solid #f3caca",

        borderRadius:
          "10px",

        padding:
          "11px 13px",

        fontSize:
          "11px",

        fontWeight:
          800,
      }}
    >
      {text}
    </div>
  );
}


const labelStyle = {
  color:
    "#4B1678",

  fontSize:
    "11px",

  fontWeight:
    800,

  marginBottom:
    "6px",
};


const fieldStyle = {
  width:
    "100%",

  boxSizing:
    "border-box" as const,

  border:
    "1px solid #d8cce0",

  borderRadius:
    "9px",

  padding:
    "11px",

  background:
    "white",

  color:
    "#21152a",

  fontSize:
    "12px",
};


const saveButton = {
  border:
    0,

  background:
    "#4B1678",

  color:
    "white",

  borderRadius:
    "9px",

  padding:
    "12px 17px",

  fontWeight:
    900,

  fontSize:
    "12px",

  cursor:
    "pointer",
};
