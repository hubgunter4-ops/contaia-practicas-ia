import { handleDocuments } from "../../src/documents/server.js";

export default async function documentsHandler(request, response) {
  return handleDocuments(request, response);
}
