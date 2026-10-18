import { handleTools } from "../../src/tools/server.js";

export default async function toolsHandler(request, response) {
  return handleTools(request, response);
}
