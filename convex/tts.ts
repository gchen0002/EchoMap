"use node";

import { createSign } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICE_NAME = "en-US-Standard-D";
const LANGUAGE_CODE = "en-US";
const MAX_TOKEN_LIFETIME_SECONDS = 60 * 60;
const MONTHLY_CHARACTER_LIMIT = 3_500_000;
const RESERVATION_TIMEOUT_MS = 10 * 60 * 1000;
const GOOGLE_TTS_MAX_ATTEMPTS = 3;
const RETRYABLE_HTTP_STATUS_CODES = new Set([500, 502, 503, 504]);
const RETRYABLE_GOOGLE_STATUSES = new Set(["INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"]);

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleTtsSuccessResponse = {
  audioContent?: string;
};

type GoogleTtsAudioPayload = {
  audioContent: string;
};

type GoogleTtsErrorResponse = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
};

type TtsResult = {
  success: true;
  fallback?: "text_only";
  reason?: string;
};

type QuotaReservationResult = {
  allowed: boolean;
  reason: string | null;
  usedCharacters?: number;
  reservedCharacters?: number;
  limit?: number;
};

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseServiceAccount(rawCredentials: string): GoogleServiceAccount {
  const parsed = JSON.parse(rawCredentials) as Partial<GoogleServiceAccount>;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON is missing client_email or private_key"
    );
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: parsed.project_id,
  };
}

function createSignedJwt(credentials: GoogleServiceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + MAX_TOKEN_LIFETIME_SECONDS;

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claims = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: expiresAt,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedClaims = toBase64Url(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(credentials.private_key);

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

async function getGoogleAccessToken(credentials: GoogleServiceAccount) {
  const assertion = createSignedJwt(credentials);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenPayload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !tokenPayload.access_token) {
    console.error("[Google Cloud auth failed]", {
      statusCode: response.status,
      error: tokenPayload.error,
      errorDescription: tokenPayload.error_description,
      projectId: credentials.project_id,
    });

    throw new Error(
      `Google auth failed [${tokenPayload.error ?? response.status}]: ${tokenPayload.error_description ?? "Unknown authentication error"}`
    );
  }

  return tokenPayload.access_token;
}

function parseGoogleTtsError(errorPayload: GoogleTtsErrorResponse, fallbackText: string) {
  return {
    status: errorPayload.error?.status ?? null,
    message: errorPayload.error?.message ?? fallbackText,
    code: errorPayload.error?.code ?? null,
  };
}

function getCurrentUsagePeriod(now: number) {
  const currentDate = new Date(now);
  const year = currentDate.getUTCFullYear();
  const month = String(currentDate.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function createReservationId(userId: Id<"users">, text: string, now: number) {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${userId}-${text.length}-${now}-${randomSuffix}`;
}

function isRetryableGoogleTtsError(statusCode: number, errorStatus: string | null) {
  return (
    RETRYABLE_HTTP_STATUS_CODES.has(statusCode) ||
    (errorStatus !== null && RETRYABLE_GOOGLE_STATUSES.has(errorStatus))
  );
}

function buildSynthesizeRequest(text: string, accessToken: string) {
  return fetch(SYNTHESIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: LANGUAGE_CODE,
        name: VOICE_NAME,
        ssmlGender: "MALE",
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    }),
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeGoogleTtsWithRetry(args: {
  accessToken: string;
  text: string;
  logPrefix: string;
}): Promise<GoogleTtsAudioPayload> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GOOGLE_TTS_MAX_ATTEMPTS; attempt += 1) {
    const response = await buildSynthesizeRequest(args.text, args.accessToken);

    if (response.ok) {
      const synthPayload = (await response.json()) as GoogleTtsSuccessResponse;

      if (!synthPayload.audioContent) {
        throw new Error("Google Cloud TTS returned no audio content");
      }

      return {
        audioContent: synthPayload.audioContent,
      };
    }

    const errorText = await response.text();
    let parsedError: GoogleTtsErrorResponse = {};

    try {
      parsedError = JSON.parse(errorText) as GoogleTtsErrorResponse;
    } catch {
      parsedError = {};
    }

    const errorDetails = parseGoogleTtsError(parsedError, errorText);

    console.error(`[${args.logPrefix}]`, {
      attempt,
      statusCode: response.status,
      errorStatus: errorDetails.status,
      errorCode: errorDetails.code,
      errorMessage: errorDetails.message,
      rawError: errorText,
      voiceName: VOICE_NAME,
      languageCode: LANGUAGE_CODE,
      textPreview: args.text.slice(0, 80),
    });

    lastError = new Error(
      `Google Cloud TTS error [${errorDetails.status ?? response.status}]: ${errorDetails.message}`
    );

    if (!isRetryableGoogleTtsError(response.status, errorDetails.status) || attempt === GOOGLE_TTS_MAX_ATTEMPTS) {
      throw lastError;
    }

    await delay(attempt * 750);
  }

  throw lastError ?? new Error("Google Cloud TTS failed after retries");
}

async function saveTextOnlyEcho(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    lat: number;
    lng: number;
    text: string;
  },
  reason: string
): Promise<TtsResult> {
  console.warn("[Google Cloud TTS fallback] Saving text-only echo", {
    reason,
  });

  await ctx.runMutation(api.echoes.createEcho, {
    userId: args.userId,
    lat: args.lat,
    lng: args.lng,
    text: args.text,
    isAiGenerated: false,
  });

  return {
    success: true,
    fallback: "text_only" as const,
    reason,
  };
}

/**
 * Google Cloud Text-to-Speech Action
 *
 * Convex Actions can call external APIs. This action:
 * 1. Sends the user's text to Google Cloud TTS
 * 2. Receives base64-encoded MP3 audio
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
  handler: async (ctx, { userId, lat, lng, text }): Promise<TtsResult> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const rawCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!rawCredentials) {
      return await saveTextOnlyEcho(
        ctx,
        { userId, lat, lng, text },
        "not_configured"
      );
    }

    const now = Date.now();
    const period = getCurrentUsagePeriod(now);
    const requestId = createReservationId(userId, text, now);
    const quotaReservation: QuotaReservationResult = await ctx.runMutation(
      internal.ttsUsage.reserveMonthlyQuota,
      {
        period,
        requestId,
        characters: text.length,
        limit: MONTHLY_CHARACTER_LIMIT,
        expiresAt: now + RESERVATION_TIMEOUT_MS,
      }
    );

    if (!quotaReservation.allowed) {
      console.warn("[Google Cloud TTS quota guard] Falling back before synthesis", {
        period,
        usedCharacters: quotaReservation.usedCharacters,
        reservedCharacters: quotaReservation.reservedCharacters,
        limit: quotaReservation.limit,
      });

      return await saveTextOnlyEcho(
        ctx,
        { userId, lat, lng, text },
        quotaReservation.reason ?? "monthly_quota_exceeded"
      );
    }

    let reservationConsumed = false;

    try {
      const credentials = parseServiceAccount(rawCredentials);
      const accessToken = await getGoogleAccessToken(credentials);

      let synthPayload: GoogleTtsAudioPayload;

      try {
        synthPayload = await synthesizeGoogleTtsWithRetry({
          accessToken,
          text,
          logPrefix: "Google Cloud TTS failed",
        });
      } catch (error) {
        return await saveTextOnlyEcho(
          ctx,
          { userId, lat, lng, text },
          error instanceof Error ? error.message : "tts_request_failed"
        );
      }

      console.info("[Google Cloud TTS succeeded]", {
        voiceName: VOICE_NAME,
        languageCode: LANGUAGE_CODE,
        textLength: text.length,
        projectId: credentials.project_id,
      });

      const audioBuffer = Uint8Array.from(Buffer.from(synthPayload.audioContent, "base64"));
      const uploadUrl = await ctx.runMutation(api.echoes.generateUploadUrl);
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: audioBuffer,
      });

      if (!uploadResponse.ok) {
        const uploadErrorText = await uploadResponse.text();
        console.error("[Google Cloud TTS upload failed]", {
          statusCode: uploadResponse.status,
          errorMessage: uploadErrorText,
        });

        return await saveTextOnlyEcho(
          ctx,
          { userId, lat, lng, text },
          "storage_upload_failed"
        );
      }

      const { storageId } = (await uploadResponse.json()) as {
        storageId: string;
      };

      await ctx.runMutation(api.echoes.createEcho, {
        userId,
        lat,
        lng,
        audioStorageId: storageId as Id<"_storage">,
        text,
        isAiGenerated: true,
      });

      await ctx.runMutation(internal.ttsUsage.finishReservation, {
        requestId,
        consumed: true,
      });
      reservationConsumed = true;

      return { success: true };
    } catch (error) {
      console.error("[Google Cloud TTS unexpected failure]", {
        error: error instanceof Error ? error.message : String(error),
        voiceName: VOICE_NAME,
        textPreview: text.slice(0, 80),
      });

      return await saveTextOnlyEcho(
        ctx,
        { userId, lat, lng, text },
        error instanceof Error ? error.message : "unexpected_error"
      );
    } finally {
      if (!reservationConsumed) {
        await ctx.runMutation(internal.ttsUsage.finishReservation, {
          requestId,
          consumed: false,
        });
      }
    }
  },
});

export const generateAndCreateSeedEcho = internalAction({
  args: {
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { userId, lat, lng, text }): Promise<TtsResult> => {
    const rawCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!rawCredentials) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not configured");
    }

    const now = Date.now();
    const period = getCurrentUsagePeriod(now);
    const requestId = createReservationId(userId, text, now);
    const quotaReservation: QuotaReservationResult = await ctx.runMutation(
      internal.ttsUsage.reserveMonthlyQuota,
      {
        period,
        requestId,
        characters: text.length,
        limit: MONTHLY_CHARACTER_LIMIT,
        expiresAt: now + RESERVATION_TIMEOUT_MS,
      }
    );

    if (!quotaReservation.allowed) {
      throw new Error(quotaReservation.reason ?? "monthly_quota_exceeded");
    }

    let reservationConsumed = false;

    try {
      const credentials = parseServiceAccount(rawCredentials);
      const accessToken = await getGoogleAccessToken(credentials);

      const synthPayload = await synthesizeGoogleTtsWithRetry({
        accessToken,
        text,
        logPrefix: "Google Cloud TTS seed failed",
      });

      const audioBuffer = Uint8Array.from(Buffer.from(synthPayload.audioContent, "base64"));
      const uploadUrl = await ctx.runMutation(internal.echoes.generateUploadUrlInternal, {});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: audioBuffer,
      });

      if (!uploadResponse.ok) {
        const uploadErrorText = await uploadResponse.text();
        throw new Error(
          `Convex storage upload failed: ${uploadResponse.status} - ${uploadErrorText}`
        );
      }

      const { storageId } = (await uploadResponse.json()) as {
        storageId: string;
      };

      await ctx.runMutation(internal.echoes.createEchoInternal, {
        userId,
        lat,
        lng,
        audioStorageId: storageId as Id<"_storage">,
        text,
        isAiGenerated: true,
      });

      await ctx.runMutation(internal.ttsUsage.finishReservation, {
        requestId,
        consumed: true,
      });
      reservationConsumed = true;

      console.info("[Google Cloud TTS seed succeeded]", {
        voiceName: VOICE_NAME,
        textLength: text.length,
      });

      return { success: true };
    } finally {
      if (!reservationConsumed) {
        await ctx.runMutation(internal.ttsUsage.finishReservation, {
          requestId,
          consumed: false,
        });
      }
    }
  },
});
