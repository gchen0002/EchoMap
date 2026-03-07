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
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";
import DropEchoModal from "./DropEchoModal";

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

const DISCOVERY_RADIUS_LABEL = "150m";

type GeoErrorType = "permission" | "timeout" | "unavailable" | null;

export default function EchoMap() {
  const mapRef = useRef<MapRef>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [geoError, setGeoError] = useState<GeoErrorType>(null);
  const [selectedEcho, setSelectedEcho] = useState<EchoMarker | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";

  const { user, isSignedIn } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);
  const currentUser = useQuery(
    api.users.getByClerkId,
    isSignedIn && user ? { clerkId: user.id } : "skip"
  );

  const nearbyEchoes = useQuery(
    api.echoes.getNearbyEchoes,
    userPosition
      ? { userLat: userPosition.lat, userLng: userPosition.lng }
      : "skip"
  );

  const echoMarkers = (nearbyEchoes ?? []).filter(
    (echo) => Number.isFinite(echo.lat) && Number.isFinite(echo.lng)
  );

  const canDropEcho = Boolean(isSignedIn && userPosition && currentUser);
  const isLoadingEchoes = Boolean(userPosition && nearbyEchoes === undefined);
  const nearbyPreview = echoMarkers.slice(0, 4);

  useEffect(() => {
    if (isSignedIn && user) {
      void upsertUser({
        clerkId: user.id,
        name: user.fullName || user.username || "Anonymous",
        avatarUrl: user.imageUrl,
      });
    }
  }, [isSignedIn, user, upsertUser]);

  const hasGeolocation = Boolean(navigator.geolocation);

  useEffect(() => {
    if (!hasGeolocation) return;

    let mounted = true;

    const handleGeoError = (err: GeolocationPositionError) => {
      if (!mounted) return;
      console.error("Geolocation error:", err);
      if (err.code === err.PERMISSION_DENIED) {
        setGeoError("permission");
      } else if (err.code === err.TIMEOUT) {
        setGeoError("timeout");
      } else {
        setGeoError("unavailable");
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mounted) return;
        setGeoError(null);
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      handleGeoError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      mounted = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [hasGeolocation]);

  const displayGeoError = !hasGeolocation ? "unavailable" as const : geoError;

  const playAudio = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlaying(true);

    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);

    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, []);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const mapStatus = displayGeoError === "permission"
    ? "Location permission denied"
    : displayGeoError === "timeout"
      ? "Location timeout - try again"
      : displayGeoError === "unavailable"
        ? "Location unavailable"
        : !userPosition
          ? "Waiting for location..."
          : isLoadingEchoes
            ? "Looking for nearby echoes"
            : echoMarkers.length === 0
              ? "No echoes nearby"
              : `${echoMarkers.length} ${echoMarkers.length === 1 ? "echo" : "echoes"} nearby`;

  const dropEchoHint = !isSignedIn
    ? "Sign in to leave an echo."
    : displayGeoError === "permission"
      ? "Allow location access in your browser settings."
      : displayGeoError
        ? "Location unavailable. Try refreshing the page."
        : !userPosition
          ? "Enable location to drop an echo."
          : !currentUser
            ? "Syncing your account."
            : `People within ${DISCOVERY_RADIUS_LABEL} can hear your echo for 24 hours.`;

  if (!mapboxToken) {
    return (
      <div className="echomap-shell flex h-screen items-center justify-center bg-[#121314] p-6 text-[#f3f3ef]">
        <div className="w-full max-w-md rounded-[10px] border border-[#2b2e2f] bg-[#1a1c1d] p-6 shadow-sm">
          <div className="text-sm font-medium text-[#f3f3ef]">Mapbox token required</div>
          <p className="mt-2 text-sm leading-6 text-[#a7aba4]">
            Add `NEXT_PUBLIC_MAPBOX_TOKEN` to `echomap/.env.local`, then restart the
            dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="echomap-shell relative h-screen overflow-hidden bg-[#121314] text-[#f3f3ef]">
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
            <div className="h-4 w-4 rounded-full border-2 border-white bg-[#8ea26f]" />
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
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#5a624d] bg-[#1a1d18] text-[#e7ebde]"
              aria-label={`Open echo from ${echo.userName}`}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </button>
          </Marker>
        ))}
      </Map>

      <header className="absolute inset-x-0 top-0 z-20 border-b border-[#2b2e2f] bg-[#1a1c1d]/96">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#f3f3ef]">EchoMap</div>
            <div className="truncate text-xs text-[#a7aba4]">{mapStatus}</div>
          </div>

          <div className="flex items-center gap-2">
            {!isSignedIn ? (
              <SignInButton mode="modal">
                <button className="rounded-[8px] border border-[#3a3d3e] bg-[#202324] px-3 py-2 text-sm text-[#f3f3ef] transition-colors hover:bg-[#26292a]">
                  Sign in
                </button>
              </SignInButton>
            ) : (
              <div className="flex items-center gap-3 rounded-[8px] border border-[#2b2e2f] bg-[#202324] px-3 py-2">
                <span className="hidden max-w-[160px] truncate text-sm text-[#d4d7d1] sm:block">
                  {user?.firstName || user?.username || "Explorer"}
                </span>
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
        </div>
      </header>

      <section className="absolute left-4 right-4 top-[72px] z-20 md:right-auto md:w-[320px]">
        <div className="max-h-[42vh] overflow-y-auto rounded-[10px] border border-[#2b2e2f] bg-[#1a1c1d]/96 shadow-sm">
          {selectedEcho ? (
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#2b2e2f] pb-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#f3f3ef]">
                    {selectedEcho.userName}
                  </div>
                  <div className="mt-1 text-xs text-[#a7aba4]">
                    {selectedEcho.distance}m away • {formatTimestamp(selectedEcho.createdAt)}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEcho(null)}
                  className="rounded-[8px] border border-[#3a3d3e] px-2 py-1 text-sm text-[#c0c4bd] transition-colors hover:bg-[#232627] hover:text-[#f3f3ef]"
                >
                  Close
                </button>
              </div>

              {selectedEcho.text ? (
                <p className="mt-4 text-sm leading-6 text-[#d4d7d1]">{selectedEcho.text}</p>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[#a7aba4]">
                  This echo has audio only.
                </p>
              )}

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-[#8f948b]">
                  Available within {DISCOVERY_RADIUS_LABEL}
                </div>
                {selectedEcho.audioUrl ? (
                  <button
                    onClick={() => playAudio(selectedEcho.audioUrl!)}
                    className="rounded-[8px] bg-[#8ea26f] px-3 py-2 text-sm font-medium text-[#121314] transition-colors hover:bg-[#9aae7d]"
                  >
                    {isPlaying ? "Playing" : "Play"}
                  </button>
                ) : (
                  <span className="text-xs text-[#8f948b]">Audio unavailable</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-[#2b2e2f] px-4 py-3 text-sm font-medium text-[#f3f3ef]">
                Nearby echoes
              </div>

              {!userPosition ? (
                displayGeoError === "permission" ? (
                  <p className="px-4 py-4 text-sm leading-6 text-[#e8a26f]">
                    Location permission denied. Enable it in your browser settings.
                  </p>
                ) : displayGeoError === "timeout" ? (
                  <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                    Location request timed out. Please try again.
                  </p>
                ) : displayGeoError === "unavailable" ? (
                  <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                    Location unavailable on this device.
                  </p>
                ) : (
                  <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                    {isSignedIn
                      ? "Sign in, then enable location to drop an echo."
                      : "Enable location to see echoes around you."}
                  </p>
                )
              ) : isLoadingEchoes ? (
                <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                  Looking for echoes nearby.
                </p>
              ) : nearbyPreview.length === 0 ? (
                <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                  No active echoes are nearby.
                </p>
              ) : (
                <div>
                  {nearbyPreview.map((echo, index) => (
                    <button
                      key={echo._id}
                      type="button"
                      onClick={() => setSelectedEcho(echo as unknown as EchoMarker)}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-[#202324] ${
                        index > 0 ? "border-t border-[#2b2e2f]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-[#f3f3ef]">
                          {echo.userName}
                        </span>
                        <span className="text-xs text-[#8f948b]">{echo.distance}m</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-[#a7aba4]">
                        {echo.text || "Audio echo"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-[#2b2e2f] bg-[#1a1c1d]/96">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-[#d4d7d1]">{dropEchoHint}</div>
            {userPosition && (
              <div className="mt-1 text-xs text-[#8f948b]">
                {userPosition.lat.toFixed(3)}, {userPosition.lng.toFixed(3)}
              </div>
            )}
          </div>

          <button
            disabled={!canDropEcho}
            onClick={() => setIsModalOpen(true)}
            className={`rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
              canDropEcho
                ? "bg-[#8ea26f] text-[#121314] hover:bg-[#9aae7d]"
                : "border border-[#3a3d3e] bg-[#202324] text-[#7f847b]"
            }`}
          >
            Drop echo
          </button>
        </div>
      </footer>

      <DropEchoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userPosition={userPosition}
        userId={currentUser?._id}
      />
    </div>
  );
}
