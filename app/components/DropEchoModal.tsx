"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface DropEchoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPosition: { lat: number; lng: number } | null;
  userId: Id<"users"> | undefined;
}

export default function DropEchoModal({
  isOpen,
  onClose,
  userPosition,
  userId,
}: DropEchoModalProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const generateAndCreateEcho = useAction(api.tts.generateAndCreateEcho);

  if (!isOpen || !userPosition || !userId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await generateAndCreateEcho({
        userId,
        lat: userPosition.lat,
        lng: userPosition.lng,
        text: text.trim(),
      });
      setText("");
      onClose();
    } catch (error) {
      console.error("Failed to drop echo:", error);
      if (error instanceof Error) {
        if (error.message.includes("GOOGLE_APPLICATION_CREDENTIALS_JSON")) {
          setSubmitError("Google Cloud TTS is not configured yet.");
        } else if (error.message.includes("PERMISSION_DENIED")) {
          setSubmitError("Google Cloud TTS permission denied. Check your service account roles.");
        } else if (error.message.includes("RESOURCE_EXHAUSTED")) {
          setSubmitError("Google Cloud TTS quota was exceeded.");
        } else if (error.message.includes("invalid_grant")) {
          setSubmitError("Google Cloud credentials are invalid or expired.");
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError("Failed to generate audio for this echo.");
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
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>

          <h2 className="text-xl font-bold text-white mb-2">Drop an Echo</h2>
          <p className="text-gray-400 text-sm mb-6">
            Leave a voice note here for others to discover. It will vanish in 24 hours.
          </p>

          <form onSubmit={handleSubmit}>
            {submitError && (
              <div className="mb-4 rounded-[8px] border border-[#6a4a3d] bg-[#2b201c] px-3 py-2 text-sm text-[#e6c3b4]">
                {submitError}
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's on your mind? (We'll use AI to read it aloud)"
              className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              maxLength={200}
            />
            <div className="flex items-center justify-between mt-2 mb-6">
              <span className="text-xs text-gray-500">
                {text.length}/200 characters
              </span>
              <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-1 rounded-md">
                ✨ Powered by Google Cloud TTS
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !text.trim()}
              className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating Audio...
                </>
              ) : (
                "Drop Echo"
              )}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
