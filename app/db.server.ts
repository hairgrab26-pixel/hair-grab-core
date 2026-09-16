import { PrismaClient } from "@prisma/client";

// Recovery internals must never hitchhike on a route returning a Seller object.
// Server-only provisioning/dispatch readers opt in explicitly.
const createClient = () => new PrismaClient({ omit: { seller: { sameDayProvisioningData: true } } }) as PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createClient();
  }
}

const prisma = global.prismaGlobal ?? createClient();

export default prisma;
