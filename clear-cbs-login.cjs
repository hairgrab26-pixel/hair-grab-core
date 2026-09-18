const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = "crownedbysacred@gmail.com";

  const account = await prisma.sellerPortalAccount.findUnique({
    where: { email },
  });

  if (!account) {
    console.log("No SellerPortalAccount found for", email);
    return;
  }

  await prisma.sellerLoginToken.deleteMany({
    where: {
      portalAccountId: account.id,
    },
  });

  await prisma.sellerPortalAccount.delete({
    where: { email },
  });

  console.log("Deleted old seller login for", email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });