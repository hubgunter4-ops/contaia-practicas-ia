import { handleAnamSession } from "../../src/tutor/anam-session.js";

export default async function anamSessionHandler(request, response) {
  return handleAnamSession(request, response);
}
