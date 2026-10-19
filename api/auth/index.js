import { handleAuth } from "../../src/auth/server.js";

export default async function authHandler(request, response) {
  return handleAuth(request, response);
}
