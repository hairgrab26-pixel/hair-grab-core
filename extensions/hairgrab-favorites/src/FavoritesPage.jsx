import "@shopify/ui-extensions/preact";

import {
  render,
} from "preact";

import {
  useEffect,
  useState,
} from "preact/hooks";


export default async () => {
  render(
    <FavoritesPage />,
    document.body,
  );
};


function formatMoney(
  amount,
  currencyCode,
) {
  const number =
    Number(amount);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return "";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        currencyCode ||
        "USD",
    },
  ).format(number);
}


function FavoritesPage() {
  const [
    favorites,
    setFavorites,
  ] =
    useState([]);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    removingId,
    setRemovingId,
  ] =
    useState("");


  useEffect(
    () => {
      loadFavorites();
    },

    [],
  );


  async function getToken() {
    return await shopify
      .sessionToken
      .get();
  }


  async function loadFavorites() {
    try {
      setLoading(
        true,
      );

      setError(
        "",
      );


      const token =
        await getToken();


      const response =
        await fetch(
          "https://seller.hairgrab.com/api/customer-favorites",
          {
            method:
              "GET",

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {
        throw new Error(
          data?.message ||
          "Unable to load favorites.",
        );
      }


      setFavorites(
        Array.isArray(
          data.favorites,
        )
          ? data.favorites
          : [],
      );
    } catch (
      err
    ) {
      console.error(
        "HairGrab favorites error:",
        err,
      );


      setError(
        err instanceof
        Error
          ? err.message
          : "We couldn't load your favorites right now.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  async function removeFavorite(
    productGid,
  ) {
    try {
      setRemovingId(
        productGid,
      );

      setError(
        "",
      );


      const token =
        await getToken();


      const response =
        await fetch(
          "https://seller.hairgrab.com/api/customer-favorites",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                intent:
                  "remove",

                productGid,
              }),
          },
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data?.message ||
          "Unable to remove favorite.",
        );
      }


      setFavorites(
        (
          current,
        ) =>
          current.filter(
            (
              favorite,
            ) =>
              favorite.productGid !==
              productGid,
          ),
      );
    } catch (
      err
    ) {
      console.error(
        "HairGrab remove favorite error:",
        err,
      );


      setError(
        err instanceof
        Error
          ? err.message
          : "We couldn't remove that favorite right now.",
      );
    } finally {
      setRemovingId(
        "",
      );
    }
  }


  return (
    <s-page heading="My Favorites">
      <s-section>
        <s-stack gap="base">

          <s-heading>
            Saved Hair You Love
          </s-heading>


          {loading && (
            <s-paragraph>
              Loading your favorites...
            </s-paragraph>
          )}


          {!loading &&
            error && (
              <s-banner tone="critical">
                {error}
              </s-banner>
            )}


          {!loading &&
            !error &&
            favorites.length ===
              0 && (
              <s-paragraph>
                You haven't saved any favorites yet.
              </s-paragraph>
            )}


          {!loading &&
            favorites.length >
              0 && (
              <s-paragraph>
                You have{" "}
                {favorites.length} saved{" "}
                {favorites.length ===
                1
                  ? "favorite"
                  : "favorites"}.
              </s-paragraph>
            )}


          {!loading &&
            favorites.map(
              (
                favorite,
              ) => (
                <s-box
                  key={
                    favorite.productGid
                  }
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-stack gap="base">

                    {favorite.imageUrl && (
                      <s-image
                        src={
                          favorite.imageUrl
                        }
                        alt={
                          favorite.imageAlt ||
                          favorite.title
                        }
                      />
                    )}


                    <s-heading>
                      {favorite.title}
                    </s-heading>


                    <s-paragraph>
                      {favorite.sellerName}
                    </s-paragraph>


                    {favorite.priceAmount && (
                      <s-paragraph>
                        {formatMoney(
                          favorite.priceAmount,
                          favorite.currencyCode,
                        )}
                      </s-paragraph>
                    )}


                    <s-link
                      href={
                        favorite.productUrl
                      }
                    >
                      View product
                    </s-link>


                    <s-button
                      variant="secondary"
                      disabled={
                        removingId ===
                        favorite.productGid
                      }
                      onClick={() =>
                        removeFavorite(
                          favorite.productGid,
                        )
                      }
                    >
                      {removingId ===
                      favorite.productGid
                        ? "Removing..."
                        : "Remove from favorites"}
                    </s-button>

                  </s-stack>
                </s-box>
              ),
            )}

        </s-stack>
      </s-section>
    </s-page>
  );
}