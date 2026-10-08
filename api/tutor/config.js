import { handleTutorConfig } from "../../src/tutor/server.js";

export default async function configHandler(request, response) {
  return handleTutorConfig(request, response);
}
