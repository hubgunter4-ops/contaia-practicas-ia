import { NextResponse } from "next/server";
import { handleTools } from "../../../src/tools/server.js";

async function invoke(request) {
  const body = request.method === "GET" || request.method === "OPTIONS" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
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
  await handleTools(nodeRequest, nodeResponse, process.env);
  return new NextResponse(responseBody, { status, headers: responseHeaders });
}

export const GET = invoke;
export const POST = invoke;
export const PATCH = invoke;
export const OPTIONS = invoke;
