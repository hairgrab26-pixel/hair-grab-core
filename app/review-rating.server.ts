import db from "./db.server";

export async function ratingEligibility(sellerProductId: string) {
  const rows = await db.$queryRaw<Array<{ rating: number | null; imported: boolean }>>`
    SELECT "rating", false AS "imported" FROM "ProductReview"
    WHERE "sellerProductId" = ${sellerProductId} AND "status" = 'PUBLISHED'
    UNION ALL
    SELECT "rating", true AS "imported" FROM "ReviewImportRow"
    WHERE "sellerProductId" = ${sellerProductId} AND "validationStatus" = 'APPROVED'
  `;
  const ratings = rows.flatMap(row => row.rating === null ? [] : [Number(row.rating)]);
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
  return { average, count: ratings.length, importedCount: rows.filter(row => row.imported).length, hairGrabVerifiedCount: rows.filter(row => !row.imported).length, fiveStarFavorites: average === 5 && ratings.length >= 3, topRated: average >= 4.7 && ratings.length >= 5 };
}
