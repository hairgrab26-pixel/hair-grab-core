import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default async () => {
  render(<FavoritesPage />, document.body);
};

function FavoritesPage() {
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFavorites();
  }, []);

  async function loadFavorites() {
    try {
      setLoading(true);
      setError("");

      const token = await shopify.sessionToken.get();

      const response = await fetch(
        "https://seller.hairgrab.com/api/customer-favorites",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Unable to load favorites.");
      }

      const data = await response.json();

      setFavoriteIds(
        Array.isArray(data.favoriteProductGids)
          ? data.favoriteProductGids
          : [],
      );
    } catch (err) {
      console.error("HairGrab favorites error:", err);
      setError("We couldn't load your favorites right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <s-page heading="My Favorites">
      <s-section>
        <s-stack gap="base">
          <s-heading>Saved Hair You Love</s-heading>

          {loading && (
            <s-paragraph>Loading your favorites...</s-paragraph>
          )}

          {!loading && error && (
            <s-banner tone="critical">
              {error}
            </s-banner>
          )}

          {!loading && !error && favoriteIds.length === 0 && (
            <s-paragraph>
              You haven't saved any favorites yet.
            </s-paragraph>
          )}

          {!loading && !error && favoriteIds.length > 0 && (
            <s-stack gap="base">
              <s-paragraph>
                You have {favoriteIds.length} saved{" "}
                {favoriteIds.length === 1 ? "favorite" : "favorites"}.
              </s-paragraph>

              {favoriteIds.map((productGid) => (
                <s-box
                  key={productGid}
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-paragraph>
                    Saved HairGrab Product
                  </s-paragraph>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}