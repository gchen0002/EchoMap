"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface DropEchoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPosition: { lat: number; lng: number } | null;
  userId: Id<"users"> | undefined;
}

type ComposerMode = "tts" | "record";

const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

function pickSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function formatRecordingDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function DropEchoModal({
  isOpen,
  onClose,
  userPosition,
  userId,
}: DropEchoModalProps) {
  const [mode, setMode] = useState<ComposerMode>("tts");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardNextRecordingRef = useRef(false);

  const generateAndCreateEcho = useAction(api.tts.generateAndCreateEcho);
  const generateUploadUrl = useMutation(api.echoes.generateUploadUrl);
  const createEcho = useMutation(api.echoes.createEcho);

  const stopStream = useCallback(() => {
    if (!mediaStreamRef.current) {
      return;
    }

    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }

    mediaStreamRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    discardNextRecordingRef.current = false;
    setRecordedBlob(null);
    setRecordedPreviewUrl(null);
    setRecordingSeconds(0);
    setRecordingError(null);
  }, []);

  const stopRecording = useCallback(
    (discard = false) => {
      discardNextRecordingRef.current = discard;

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        stopStream();
        mediaRecorderRef.current = null;
      }

      setIsRecording(false);
    },
    [stopStream]
  );

  const handleClose = useCallback(() => {
    if (isRecording) {
      stopRecording(true);
    } else {
      stopStream();
    }

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setMode("tts");
    setText("");
    setCaption("");
    setSubmitError(null);
    setRecordingError(null);
    setRecordedBlob(null);
    setRecordedPreviewUrl(null);
    setRecordingSeconds(0);
    onClose();
  }, [isRecording, onClose, stopRecording, stopStream]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        discardNextRecordingRef.current = true;
        mediaRecorderRef.current.stop();
      }

      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    if (!recordedPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(recordedPreviewUrl);
    };
  }, [recordedPreviewUrl]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRecording]);

  const handleStartRecording = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordingError("This browser does not support microphone recording.");
      return;
    }

    setSubmitError(null);
    setRecordingError(null);
    setRecordedBlob(null);
    setRecordedPreviewUrl(null);
    setRecordingSeconds(0);
    recordedChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordingError("Recording failed. Please try again.");
        setIsRecording(false);
        stopStream();
      };

      recorder.onstop = () => {
        const shouldDiscard = discardNextRecordingRef.current;
        discardNextRecordingRef.current = false;
        const chunks = recordedChunksRef.current;

        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopStream();
        setIsRecording(false);

        if (shouldDiscard || chunks.length === 0) {
          return;
        }

        const nextBlob = new Blob(chunks, {
          type: mimeType ?? chunks[0]?.type ?? "audio/webm",
        });
        setRecordedBlob(nextBlob);
        setRecordedPreviewUrl(URL.createObjectURL(nextBlob));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      stopStream();
      setRecordingError(
        error instanceof Error ? error.message : "Microphone permission was denied."
      );
    }
  }, [stopStream]);

  const submitRecordedEcho = useCallback(async () => {
    if (!recordedBlob || !userPosition || !userId) {
      return;
    }

    const uploadUrl = await generateUploadUrl({});
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": recordedBlob.type || "audio/webm",
      },
      body: recordedBlob,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload recorded audio.");
    }

    const { storageId } = (await uploadResponse.json()) as {
      storageId: string;
    };

    await createEcho({
      userId,
      lat: userPosition.lat,
      lng: userPosition.lng,
      audioStorageId: storageId as Id<"_storage">,
      text: caption.trim() || undefined,
      isAiGenerated: false,
    });
  }, [caption, createEcho, generateUploadUrl, recordedBlob, userId, userPosition]);

  if (!isOpen || !userPosition || !userId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "tts" && !text.trim()) return;
    if (mode === "record" && !recordedBlob) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (mode === "tts") {
        const result = await generateAndCreateEcho({
          userId,
          lat: userPosition.lat,
          lng: userPosition.lng,
          text: text.trim(),
        });

        if (result?.fallback === "text_only") {
          if (result.reason === "monthly_quota_exceeded") {
            setSubmitError(
              "Google Cloud TTS monthly safety limit was reached, so your echo was saved as text-only and will use browser speech playback."
            );
          } else if (result.reason === "not_configured") {
            setSubmitError(
              "Google Cloud TTS is not configured, so your echo was saved as text-only and will use browser speech playback."
            );
          } else {
            setSubmitError(
              "Google Cloud TTS was unavailable, so your echo was saved as text-only and will use browser speech playback."
            );
          }
        }
      } else {
        await submitRecordedEcho();
      }

      handleClose();
    } catch (error) {
      console.error("Failed to save echo:", error);
      if (error instanceof Error) {
        if (mode === "tts" && error.message.includes("GOOGLE_APPLICATION_CREDENTIALS_JSON")) {
          setSubmitError("Google Cloud TTS is not configured yet.");
        } else if (mode === "tts" && error.message.includes("PERMISSION_DENIED")) {
          setSubmitError("Google Cloud TTS permission denied. Check your service account roles.");
        } else if (mode === "tts" && error.message.includes("RESOURCE_EXHAUSTED")) {
          setSubmitError("Google Cloud TTS quota was exceeded.");
        } else if (mode === "tts" && error.message.includes("invalid_grant")) {
          setSubmitError("Google Cloud credentials are invalid or expired.");
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError(
          mode === "tts"
            ? "Failed to generate audio for this echo."
            : "Failed to save your recording."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative"
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>

          <h2 className="text-xl font-bold text-white mb-2">Drop an Echo</h2>
          <p className="text-gray-400 text-sm mb-6">
            Leave a voice note here for others to discover. It will vanish in 24 hours.
          </p>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-gray-800 bg-gray-950/70 p-1">
            <button
              type="button"
              disabled={isSubmitting || isRecording}
              onClick={() => {
                setMode("tts");
                setSubmitError(null);
              }}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                mode === "tts"
                  ? "bg-[#8ea26f] text-[#121314]"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              AI voice
            </button>
            <button
              type="button"
              disabled={isSubmitting || isRecording}
              onClick={() => {
                setMode("record");
                setSubmitError(null);
              }}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                mode === "record"
                  ? "bg-[#8ea26f] text-[#121314]"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              Record yourself
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {submitError && (
              <div className="mb-4 rounded-[8px] border border-[#6a4a3d] bg-[#2b201c] px-3 py-2 text-sm text-[#e6c3b4]">
                {submitError}
              </div>
            )}

            {mode === "tts" ? (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What's on your mind? We'll read it aloud with Google TTS."
                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  maxLength={200}
                />
                <div className="flex items-center justify-between mt-2 mb-6">
                  <span className="text-xs text-gray-500">{text.length}/200 characters</span>
                  <span className="rounded-md bg-[#25311c] px-2 py-1 text-xs text-[#b7d09a]">
                    Powered by Google Cloud TTS
                  </span>
                </div>
              </>
            ) : (
              <div className="mb-6 space-y-4">
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-white">Native voice recording</div>
                      <p className="mt-1 text-sm leading-6 text-gray-400">
                        Record your real voice and leave it exactly as you sound right now.
                      </p>
                    </div>
                    <div className="rounded-full border border-gray-800 px-3 py-1 text-xs text-gray-300">
                      {formatRecordingDuration(recordingSeconds)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={isSubmitting}
                        className="rounded-xl bg-[#8ea26f] px-4 py-2 text-sm font-medium text-[#121314] transition-colors hover:bg-[#9aae7d] disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                      >
                        {recordedBlob ? "Record again" : "Start recording"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => stopRecording(false)}
                        className="rounded-xl bg-[#d77d5d] px-4 py-2 text-sm font-medium text-[#161311] transition-colors hover:bg-[#e28d6d]"
                      >
                        Stop recording
                      </button>
                    )}

                    {recordedBlob && !isRecording ? (
                      <button
                        type="button"
                        onClick={clearRecording}
                        className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800"
                      >
                        Discard
                      </button>
                    ) : null}
                  </div>

                  {recordingError ? (
                    <div className="mt-3 rounded-xl border border-[#6a4a3d] bg-[#2b201c] px-3 py-2 text-sm text-[#e6c3b4]">
                      {recordingError}
                    </div>
                  ) : null}

                  {isRecording ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[#f0c8bb]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#d77d5d] animate-pulse" />
                      Recording in progress...
                    </div>
                  ) : null}

                  {recordedPreviewUrl ? (
                    <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/70 p-3">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                        Preview
                      </div>
                      <audio controls className="w-full">
                        <source src={recordedPreviewUrl} type={recordedBlob?.type || "audio/webm"} />
                      </audio>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white">
                    Optional caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a short caption so people can skim before they listen."
                    className="w-full h-28 bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    maxLength={160}
                  />
                  <div className="mt-2 text-right text-xs text-gray-500">{caption.length}/160</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                isRecording ||
                (mode === "tts" ? !text.trim() : !recordedBlob)
              }
              className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === "tts" ? "Generating Audio..." : "Saving recording..."}
                </>
              ) : (
                (mode === "tts" ? "Drop AI Echo" : "Drop recorded Echo")
              )}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
