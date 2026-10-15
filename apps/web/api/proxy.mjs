import { proxy } from '../server/beta-proxy.mjs';

// Keep the framework's second handler argument out of the proxy's test inputs.
export const GET = (request) => proxy(request);
export const HEAD = GET;
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
