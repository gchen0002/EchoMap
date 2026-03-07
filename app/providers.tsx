"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convexUrl || !clerkPublishableKey || !convex) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121314] p-6 text-[#f3f3ef]">
        <div className="w-full max-w-md rounded-[10px] border border-[#2b2e2f] bg-[#1a1c1d] p-6 shadow-sm">
          <div className="text-sm font-medium text-[#f3f3ef]">
            App configuration required
          </div>
          <p className="mt-2 text-sm leading-6 text-[#a7aba4]">
            Add `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
            to your environment before starting the app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
