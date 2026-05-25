import * as Crypto from "expo-crypto";

// SHA-256 hash of a PIN, salted with the (lowercased) username so identical PINs across users
// don't share a hash. Never store or compare plaintext PINs. Works on native + web.
export async function hashPin(username: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `pricr:${username.trim().toLowerCase()}:${pin}`,
  );
}
