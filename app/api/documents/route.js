import { NextResponse } from "next/server";
import { handleDocuments } from "../../../src/documents/server.js";

async function invoke(request) {
  const body = request.method === "POST" ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const headers = Object.fromEntries(request.headers.entries());
  const nodeRequest = {
    method: request.method,
    url: `${request.nextUrl.pathname}${request.nextUrl.search}`,
    headers,
    socket: { encrypted: request.nextUrl.protocol === "https:" },
    async *[Symbol.asyncIterator]() { if (body.length) yield body; },
  };
  let status = 200;
  const responseHeaders = {};
  let responseBody = "";
  const nodeResponse = {
    writeHead(nextStatus, nextHeaders = {}) { status = nextStatus; Object.assign(responseHeaders, nextHeaders); },
    end(value = "") { responseBody = value; },
  };
  await handleDocuments(nodeRequest, nodeResponse, process.env);
  return new NextResponse(responseBody, { status, headers: responseHeaders });
}

export const POST = invoke;
export const OPTIONS = invoke;
