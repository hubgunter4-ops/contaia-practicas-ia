import { handleTutorStream } from "../../src/tutor/server.js";

export default async function tutorStreamHandler(request, response) {
  return handleTutorStream(request, response);
}
