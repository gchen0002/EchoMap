"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Map, {
  Marker,
  NavigationControl,
  GeolocateControl,
  MapRef,
  type GeolocateResultEvent,
  type MarkerEvent,
} from "react-map-gl/mapbox";
import { motion, AnimatePresence } from "framer-motion";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";
import DropEchoModal from "./DropEchoModal";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";

  // Authentication & Live Data
  const { user, isSignedIn } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);
  const currentUser = useQuery(
    api.users.getByClerkId,
    isSignedIn && user ? { clerkId: user.id } : "skip"
  );
  
  // Real-time subscription to nearby echoes
  const nearbyEchoes = useQuery(
    api.echoes.getNearbyEchoes,
    userPosition
      ? { userLat: userPosition.lat, userLng: userPosition.lng }
      : "skip"
  );
  const echoMarkers = (nearbyEchoes ?? []).filter(
    (echo) => Number.isFinite(echo.lat) && Number.isFinite(echo.lng)
  );

  // Sync Clerk user to Convex DB on load
  useEffect(() => {
    if (isSignedIn && user) {
      upsertUser({
        clerkId: user.id,
        name: user.fullName || user.username || "Anonymous",
        avatarUrl: user.imageUrl,
      });
    }
  }, [isSignedIn, user, upsertUser]);

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

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      {!mapboxToken ? (
        <div className="flex h-full items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-2xl backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Map setup required
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Add a Mapbox token to load EchoMap.
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Set <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">.env.local</code>, then restart the dev server.
            </p>
            <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
              This keeps the app from crashing when the token is missing, and the rest of the UI can still boot cleanly.
            </div>
          </div>
        </div>
      ) : (
        <Map
          ref={mapRef}
          mapboxAccessToken={mapboxToken}
          initialViewState={{
            longitude: userPosition?.lng ?? -122.4194,
            latitude: userPosition?.lat ?? 37.7749,
            zoom: 15,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          onClick={() => setSelectedEcho(null)}
        >
          <NavigationControl position="top-right" />
          <GeolocateControl
            position="top-right"
            trackUserLocation
            showUserHeading
            onGeolocate={(e: GeolocateResultEvent) => {
              setUserPosition({
                lat: e.coords.latitude,
                lng: e.coords.longitude,
              });
            }}
          />

          {userPosition && (
            <Marker latitude={userPosition.lat} longitude={userPosition.lng}>
              <div className="relative">
                <motion.div
                  className="absolute -inset-4 rounded-full bg-blue-500/20"
                  animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/50" />
              </div>
            </Marker>
          )}

          {echoMarkers.map((echo) => (
            <Marker
              key={echo._id}
              latitude={echo.lat}
              longitude={echo.lng}
              onClick={(e: MarkerEvent<MouseEvent>) => {
                e.originalEvent.stopPropagation();
                setSelectedEcho(echo as unknown as EchoMarker);
              }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="group relative cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white/90 shadow-lg transition-colors group-hover:bg-blue-400">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                </div>
              </motion.div>
            </Marker>
          ))}
        </Map>
      )}

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

      {/* Top right action bar (Auth) */}
      <div className="absolute top-6 right-6 pointer-events-auto z-10">
        {!isSignedIn ? (
          <SignInButton mode="modal">
            <button className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-colors border border-white/20">
              Sign In
            </button>
          </SignInButton>
        ) : (
          <div className="p-1 bg-white/10 backdrop-blur-md rounded-full overflow-hidden border border-white/20 shadow-xl">
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "w-8 h-8",
                },
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 bg-gradient-to-t from-gray-950 via-gray-950/90 to-transparent pointer-events-none">
        <div className="flex items-center justify-center gap-4 px-6 pointer-events-auto">
          {/* Drop Echo button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={!isSignedIn || !userPosition || !currentUser}
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center gap-2 px-6 py-3 font-semibold rounded-full shadow-lg transition-colors
              ${
                !isSignedIn || !userPosition || !currentUser
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/30"
              }`}
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
                  {selectedEcho.userName?.[0]?.toUpperCase() ?? "?"}
                </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm truncate">
                    {selectedEcho.userName}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {formatTimestamp(selectedEcho.createdAt)}
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

      {/* Drop Echo Modal */}
      <DropEchoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userPosition={userPosition}
        userId={currentUser?._id}
      />
    </div>
  );
}
