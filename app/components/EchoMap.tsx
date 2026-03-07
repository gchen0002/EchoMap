"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Map, {
  Marker,
  NavigationControl,
  MapRef,
  type MapMouseEvent,
  type MarkerEvent,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";
import DropEchoModal from "./DropEchoModal";
import { DISCOVERY_RADIUS_METERS } from "../../lib/geohash";

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

const DISCOVERY_RADIUS_LABEL = `${DISCOVERY_RADIUS_METERS}m`;
const LOCATION_OVERRIDE_CLERK_ID = "user_3Aaz1EqZth7kGlOfFLZ6BLSJ6oO";

type GeoErrorType = "permission" | "timeout" | "unavailable" | null;

export default function EchoMap() {
  const mapRef = useRef<MapRef>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [geoError, setGeoError] = useState<GeoErrorType>(null);
  const [selectedEcho, setSelectedEcho] = useState<EchoMarker | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isTeleportModeEnabled, setIsTeleportModeEnabled] = useState(false);
  const [teleportPulse, setTeleportPulse] = useState<{ lat: number; lng: number } | null>(null);
  const [upsertError, setUpsertError] = useState<Error | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";

  const { user, isSignedIn } = useUser();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const upsertUser = useMutation(api.users.upsertUser);
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isSignedIn && isConvexAuthenticated ? {} : "skip"
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
  const canOverrideLocation = user?.id === LOCATION_OVERRIDE_CLERK_ID;
  const isTeleportModeActive = canOverrideLocation && isTeleportModeEnabled;

  const canDropEcho = Boolean(
    isSignedIn && isConvexAuthenticated && userPosition && currentUser
  );
  const isLoadingEchoes = Boolean(userPosition && nearbyEchoes === undefined);
  const nearbyPreview = echoMarkers.slice(0, 4);

  useEffect(() => {
    if (
      !isSignedIn ||
      !user ||
      !isConvexAuthenticated ||
      currentUser !== null
    ) {
      return;
    }

    let cancelled = false;

    void upsertUser({
      name: user.fullName || user.username || "Anonymous",
      avatarUrl: user.imageUrl,
    })
      .then(() => {
        if (!cancelled) {
          setUpsertError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to upsert user:", error);
          setUpsertError(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, isConvexAuthenticated, isSignedIn, upsertUser, user]);

  const hasGeolocation =
    typeof navigator !== "undefined" && "geolocation" in navigator;

  const centerMapOnUser = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;

    if (!map || !isMapReady) return false;

    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 15.5),
      essential: true,
      duration: 900,
    });

    return true;
  }, [isMapReady]);

  const applyPosition = useCallback(
    (coords: Pick<GeolocationCoordinates, "latitude" | "longitude">, shouldCenter = false) => {
      setGeoError(null);

      const nextPosition = {
        lat: coords.latitude,
        lng: coords.longitude,
      };

      setUserPosition(nextPosition);

      if (shouldCenter) {
        centerMapOnUser(nextPosition.lng, nextPosition.lat);
      }
    },
    [centerMapOnUser]
  );

  const handleGeoError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setGeoError("permission");
    } else if (err.code === err.TIMEOUT) {
      setGeoError("timeout");
    } else {
      setGeoError("unavailable");
    }
  }, []);

  const locateUser = useCallback(() => {
    if (isTeleportModeActive && userPosition) {
      centerMapOnUser(userPosition.lng, userPosition.lat);
      return;
    }

    if (userPosition) {
      centerMapOnUser(userPosition.lng, userPosition.lat);
    }

    if (!hasGeolocation) {
      setGeoError("unavailable");
      return;
    }

    setIsLocating(true);

    const hasKnownPosition = Boolean(userPosition);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        applyPosition(pos.coords, true);
      },
      (err) => {
        setIsLocating(false);

        if (!hasKnownPosition) {
          handleGeoError(err);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [
    applyPosition,
    centerMapOnUser,
    handleGeoError,
    hasGeolocation,
    isTeleportModeActive,
    userPosition,
  ]);

  useEffect(() => {
    if (isTeleportModeActive) {
      return;
    }

    if (!hasGeolocation) return;

    let mounted = true;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mounted) return;
        applyPosition(pos.coords);
      },
      (err) => {
        if (!mounted) return;
        handleGeoError(err);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => {
      mounted = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [applyPosition, handleGeoError, hasGeolocation, isTeleportModeActive]);

  useEffect(() => {
    if (!teleportPulse) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTeleportPulse(null);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [teleportPulse]);

  const moveOverrideLocation = useCallback(
    (lng: number, lat: number) => {
      setGeoError(null);
      setUserPosition({ lat, lng });
      setTeleportPulse({ lat, lng });
      centerMapOnUser(lng, lat);
    },
    [centerMapOnUser]
  );

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      setSelectedEcho(null);

      if (!isTeleportModeActive) {
        return;
      }

      moveOverrideLocation(event.lngLat.lng, event.lngLat.lat);
    },
    [isTeleportModeActive, moveOverrideLocation]
  );

  const toggleTeleportMode = useCallback(() => {
    if (!canOverrideLocation) {
      return;
    }

    setIsTeleportModeEnabled((current) => {
      const next = !current;

      if (next && userPosition === null) {
        setUserPosition({ lat: 37.7749, lng: -122.4194 });
      }

      return next;
    });
    setTeleportPulse(null);
  }, [canOverrideLocation, userPosition]);


  const displayGeoError = !hasGeolocation ? "unavailable" as const : geoError;

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }

    speechSynthesisRef.current = null;
    setIsPlaying(false);
  }, []);

  const playAudio = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
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

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }

    stopPlayback();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      speechSynthesisRef.current = null;
      setIsPlaying(false);
    };
    utterance.onerror = () => {
      speechSynthesisRef.current = null;
      setIsPlaying(false);
    };

    speechSynthesisRef.current = utterance;
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
    return true;
  }, [stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

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
        : isLocating
          ? "Finding your location"
        : isSignedIn && isConvexAuthLoading
          ? "Connecting account..."
        : !userPosition
          ? "Waiting for location..."
          : isLoadingEchoes
            ? "Looking for nearby echoes"
            : echoMarkers.length === 0
              ? "No echoes nearby"
              : `${echoMarkers.length} ${echoMarkers.length === 1 ? "echo" : "echoes"} nearby`;

  const dropEchoHint = !isSignedIn
    ? "Sign in to leave an echo."
    : upsertError
      ? `Account error: ${upsertError.message}`
    : isConvexAuthLoading
      ? "Connecting your account."
    : isTeleportModeActive
      ? "Admin mode: click anywhere on the map to move your location instantly."
    : canOverrideLocation
      ? "Teleport mode is available for this account."
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
        onClick={handleMapClick}
        onLoad={() => setIsMapReady(true)}
      >
        <NavigationControl position="top-right" />

        {userPosition && (
          <Marker latitude={userPosition.lat} longitude={userPosition.lng}>
            <div className="h-4 w-4 rounded-full border-2 border-white bg-[#8ea26f]" />
          </Marker>
        )}

        {teleportPulse && (
          <Marker latitude={teleportPulse.lat} longitude={teleportPulse.lng}>
            <div className="pointer-events-none flex h-16 w-16 items-center justify-center">
              <div className="absolute h-14 w-14 rounded-full border border-[#dce6cc]/40 bg-[#dce6cc]/10 animate-ping" />
              <div className="h-4 w-4 rounded-full border-2 border-[#f3f3ef] bg-[#dce6cc] shadow-[0_0_20px_rgba(220,230,204,0.45)]" />
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
            {canOverrideLocation && (
              <button
                type="button"
                onClick={toggleTeleportMode}
                className={`hidden rounded-[8px] border px-3 py-2 text-xs transition-colors md:block ${
                  isTeleportModeActive
                    ? "border-[#8ea26f] bg-[#23281f] text-[#dce6cc] hover:bg-[#283022]"
                    : "border-[#3a3d3e] bg-[#202324] text-[#b7bbb4] hover:bg-[#26292a]"
                }`}
              >
                {isTeleportModeActive ? "Teleport mode on" : "Teleport mode off"}
              </button>
            )}
            <button
              type="button"
              onClick={locateUser}
              disabled={isLocating}
              className="rounded-[8px] border border-[#3a3d3e] bg-[#202324] px-3 py-2 text-sm text-[#f3f3ef] transition-colors hover:bg-[#26292a] disabled:cursor-wait disabled:text-[#8f948b]"
            >
              {isLocating ? "Locating..." : "Locate me"}
            </button>
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
                ) : selectedEcho.text ? (
                  <button
                    onClick={() => {
                      if (!speakText(selectedEcho.text!)) {
                        setSelectedEcho(selectedEcho);
                      }
                    }}
                    className="rounded-[8px] bg-[#8ea26f] px-3 py-2 text-sm font-medium text-[#121314] transition-colors hover:bg-[#9aae7d]"
                  >
                    {isPlaying ? "Speaking" : "Speak"}
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
                  <div className="px-4 py-4">
                    <p className="text-sm leading-6 text-[#a7aba4]">
                      Location request timed out. Try locating again.
                    </p>
                    <button
                      type="button"
                      onClick={locateUser}
                      disabled={isLocating}
                      className="mt-3 rounded-[8px] border border-[#3a3d3e] bg-[#202324] px-3 py-2 text-sm text-[#f3f3ef] transition-colors hover:bg-[#26292a] disabled:cursor-wait disabled:text-[#8f948b]"
                    >
                      {isLocating ? "Locating..." : "Try again"}
                    </button>
                  </div>
                ) : displayGeoError === "unavailable" ? (
                  <p className="px-4 py-4 text-sm leading-6 text-[#a7aba4]">
                    Location unavailable on this device.
                  </p>
                ) : (
                  <div className="px-4 py-4">
                    <p className="text-sm leading-6 text-[#a7aba4]">
                      {isSignedIn
                        ? "Use Locate me to find echoes around you and drop your own."
                        : "Use Locate me to find echoes around you."}
                    </p>
                    <button
                      type="button"
                      onClick={locateUser}
                      disabled={isLocating}
                      className="mt-3 rounded-[8px] border border-[#3a3d3e] bg-[#202324] px-3 py-2 text-sm text-[#f3f3ef] transition-colors hover:bg-[#26292a] disabled:cursor-wait disabled:text-[#8f948b]"
                    >
                      {isLocating ? "Locating..." : "Locate me"}
                    </button>
                  </div>
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
            {isTeleportModeActive ? (
              <div className="mt-1 text-xs text-[#8ea26f]">
                Click the map to teleport and test echoes anywhere.
              </div>
            ) : canOverrideLocation ? (
              <div className="mt-1 text-xs text-[#8f948b]">
                Turn on teleport mode to move your location by clicking the map.
              </div>
            ) : null}
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
