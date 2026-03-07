"use client";

import dynamic from "next/dynamic";

// Dynamically import EchoMap with SSR disabled (Mapbox GL requires the browser)
const EchoMap = dynamic(() => import("./components/EchoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#121314] text-[#f3f3ef]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#8ea26f] border-t-transparent" />
        <p className="text-sm text-[#a7aba4]">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <EchoMap />;
}
