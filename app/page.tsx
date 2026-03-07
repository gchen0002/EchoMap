"use client";

import dynamic from "next/dynamic";

// Dynamically import EchoMap with SSR disabled (Mapbox GL requires the browser)
const EchoMap = dynamic(() => import("./components/EchoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-screen bg-gray-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <EchoMap />;
}
