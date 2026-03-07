"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * ElevenLabs Text-to-Speech Action
 *
 * Convex Actions can call external APIs. This action:
 * 1. Sends the user's text to ElevenLabs TTS API
 * 2. Receives an audio stream back
 * 3. Uploads the audio to Convex File Storage
 * 4. Calls the createEcho mutation to save the Echo with geolocation data
 */
export const generateAndCreateEcho = action({
  args: {
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { userId, lat, lng, text }) => {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    // Use "Rachel" voice — a clear, natural-sounding default
    const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get audio as a Blob
    const audioBlob = await response.blob();

    // Upload to Convex File Storage
    const uploadUrl = await ctx.runMutation(api.echoes.generateUploadUrl);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "audio/mpeg" },
      body: audioBlob,
    });

    const { storageId } = (await uploadResponse.json()) as {
      storageId: string;
    };

    // Create the echo with the uploaded audio
    await ctx.runMutation(api.echoes.createEcho, {
      userId,
      lat,
      lng,
      audioStorageId: storageId as Id<"_storage">,
      text,
      isAiGenerated: true,
    });

    return { success: true };
  },
});
