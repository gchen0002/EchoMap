"use client";

import { ReactNode, useCallback, useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function useUseAuthFromClerk() {
  return useMemo(
    () =>
      function useAuthFromClerk() {
        const { isLoaded, isSignedIn, getToken } = useAuth();

        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
            let templateToken: string | null = null;

            try {
              templateToken = await getToken({
                template: "convex",
                skipCache: forceRefreshToken,
              });
            } catch (error) {
              if (process.env.NODE_ENV === "development") {
                console.warn("Failed to fetch Clerk convex template token", error);
              }
            }

            if (templateToken) {
              return templateToken;
            }

            try {
              return await getToken({
                skipCache: forceRefreshToken,
              });
            } catch (error) {
              if (process.env.NODE_ENV === "development") {
                console.warn("Failed to fetch Clerk session token for Convex", error);
              }
              return null;
            }
          },
          [getToken]
        );

        return useMemo(
          () => ({
            isLoading: !isLoaded,
            isAuthenticated: isSignedIn ?? false,
            fetchAccessToken,
          }),
          [fetchAccessToken, isLoaded, isSignedIn]
        );
      },
    []
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const useAuthFromClerk = useUseAuthFromClerk();

  if (!convexUrl || !convex) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121314] p-6 text-[#f3f3ef]">
        <div className="w-full max-w-md rounded-[10px] border border-[#2b2e2f] bg-[#1a1c1d] p-6 shadow-sm">
          <div className="text-sm font-medium text-[#f3f3ef]">
            App configuration required
          </div>
          <p className="mt-2 text-sm leading-6 text-[#a7aba4]">
            Add `NEXT_PUBLIC_CONVEX_URL` to your environment before starting the app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
      {children}
    </ConvexProviderWithAuth>
  );
}
