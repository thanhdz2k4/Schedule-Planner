import { readBearerToken, verifySessionToken } from "@/lib/auth/sessionToken";

export function resolveSessionFromRequest(request) {
  const token = readBearerToken(request);
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
