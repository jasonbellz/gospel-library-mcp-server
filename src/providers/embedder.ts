/**
 * embedder.ts — Azure OpenAI embedding provider.
 *
 * Uses Managed Identity (DefaultAzureCredential) for auth. The OpenAI Node
 * SDK supports custom auth via `defaultHeaders` — we attach a fresh bearer
 * token before each request so token refresh is automatic.
 */

import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";

// Maximum embedding inputs per Azure OpenAI request for text-embedding-3-small.
// The model itself accepts up to 2048 inputs; we cap lower for safety.
const MAX_BATCH_SIZE = 16;

const credential = new DefaultAzureCredential({
  managedIdentityClientId: config.azureClientId || undefined,
});

const azureADTokenProvider = getBearerTokenProvider(credential, COGNITIVE_SERVICES_SCOPE);

const client = new AzureOpenAI({
  endpoint: config.azureOpenAiEndpoint,
  azureADTokenProvider,
  apiVersion: config.azureOpenAiApiVersion,
  deployment: config.azureOpenAiDeployment,
});

/**
 * Generate a single 1536-dim embedding for the given text.
 */
export async function embed(text: string): Promise<Float32Array> {
  const result = await embedBatch([text]);
  return result[0];
}

/**
 * Generate embeddings for a batch of texts. Chunks into requests of at most
 * MAX_BATCH_SIZE inputs. Returns embeddings in the same order as inputs.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const results: Float32Array[] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + MAX_BATCH_SIZE);
    const response = await callWithRetry(() =>
      client.embeddings.create({
        input: batch,
        model: config.azureOpenAiDeployment,
      })
    );

    for (let i = 0; i < batch.length; i++) {
      const data = response.data[i];
      if (!data) {
        throw new Error(`Missing embedding at batch index ${i} (offset ${offset})`);
      }
      results[offset + i] = Float32Array.from(data.embedding);
    }
  }

  return results;
}

interface ApiError extends Error {
  status?: number;
}

async function callWithRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const apiErr = err as ApiError;
    const status = apiErr.status;
    const retriable = status === 429 || (status !== undefined && status >= 500);
    if (!retriable || attempt >= 4) throw err;

    const delayMs = Math.min(30_000, 500 * Math.pow(2, attempt)) + Math.random() * 250;
    logger.warn(
      { status, attempt, delayMs },
      "Azure OpenAI request failed; retrying after backoff"
    );
    await new Promise((r) => setTimeout(r, delayMs));
    return callWithRetry(fn, attempt + 1);
  }
}

export const EMBEDDING_DIMENSIONS = 1536;
