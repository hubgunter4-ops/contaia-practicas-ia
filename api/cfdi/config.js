import { handleCfdiConfig } from "../../src/cfdi/server.js";

export default async function cfdiConfigHandler(request, response) {
  return handleCfdiConfig(request, response);
}
