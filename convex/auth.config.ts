import type { AuthConfig } from "convex/server";

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();

if (!clerkDomain) {
  throw new Error("Convex auth requires CLERK_JWT_ISSUER_DOMAIN");
}

const authConfig: AuthConfig = {
  providers: [
    {
      domain: clerkDomain,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
