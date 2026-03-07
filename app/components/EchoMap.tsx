"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Map, {
  Marker,
  NavigationControl,
  GeolocateControl,
  MapRef,
} from "react-map-gl";
import { motion, AnimatePresence } from "framer-motion";
import "mapbox-gl/dist/mapbox-gl.css";

// Types for echo markers on the map
interface EchoMarker {
  _id: string;
  lat: number;
  lng: number;
  userName: string;
  userAvatar: string;
  audioUrl: string | null;
  text?: string;
  distance: number;
  isAiGenerated: boolean;
  createdAt: number;
}

interface UserPosition {
  lat: number;
  lng: number;
}

export default function EchoMap() {
  const mapRef = useRef<MapRef>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [selectedEcho, setSelectedEcho] = useState<EchoMarker | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get user's GPS position on mount
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Play audio for selected echo
  const playAudio = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlaying(true);
    audio.play();
    audio.onended = () => setIsPlaying(false);
  }, []);

  // Time ago helper
  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      {/* Map Container */}
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={{
          longitude: userPosition?.lng ?? -122.4194,
          latitude: userPosition?.lat ?? 37.7749,
          zoom: 15,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showUserHeading
          onGeolocate={(e) => {
            setUserPosition({
              lat: e.coords.latitude,
              lng: e.coords.longitude,
            });
          }}
        />

        {/* User position marker */}
        {userPosition && (
          <Marker latitude={userPosition.lat} longitude={userPosition.lng}>
            <div className="relative">
              {/* Pulse animation ring */}
              <motion.div
                className="absolute -inset-4 rounded-full bg-blue-500/20"
                animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/50" />
            </div>
          </Marker>
        )}
      </Map>

      {/* Top gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-gray-950/80 to-transparent pointer-events-none" />

      {/* App title */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          echo<span className="text-blue-400">map</span>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Drop a voice. Discover a moment.
        </p>
      </div>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 bg-gradient-to-t from-gray-950 via-gray-950/90 to-transparent">
        <div className="flex items-center justify-center gap-4 px-6">
          {/* Drop Echo button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-full shadow-lg shadow-blue-500/30 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Drop Echo
          </motion.button>
        </div>
      </div>

      {/* Selected echo popup */}
      <AnimatePresence>
        {selectedEcho && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-28 left-4 right-4 mx-auto max-w-sm bg-gray-900/95 backdrop-blur-xl border border-gray-800 rounded-2xl p-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {selectedEcho.userName[0]?.toUpperCase() ?? "?"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm truncate">
                    {selectedEcho.userName}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {timeAgo(selectedEcho.createdAt)}
                  </span>
                  {selectedEcho.isAiGenerated && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded-full">
                      AI
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-xs mt-0.5">
                  {selectedEcho.distance}m away
                </p>
                {selectedEcho.text && (
                  <p className="text-gray-300 text-sm mt-1 line-clamp-2">
                    &ldquo;{selectedEcho.text}&rdquo;
                  </p>
                )}
              </div>

              {/* Play button */}
              {selectedEcho.audioUrl && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => playAudio(selectedEcho.audioUrl!)}
                  className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0"
                >
                  {isPlaying ? (
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-white ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </motion.button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setSelectedEcho(null)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
