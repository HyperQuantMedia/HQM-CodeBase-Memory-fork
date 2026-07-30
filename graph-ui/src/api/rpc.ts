/* JSON-RPC client — speaks the same protocol as MCP clients via POST /rpc */

let _nextId = 1;

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: _nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new RpcError(-1, `HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new RpcError(json.error.code ?? -1, json.error.message ?? "unknown");
  }

  /* MCP tool results are wrapped: { result: { content: [{ text: "..." }] } } */
  const text = json?.result?.content?.[0]?.text;
  if (text === undefined) {
    return json.result as T;
  }

  return JSON.parse(text) as T;
}

/* Open a project path with the OS default application (POST /api/open).
 * The server fences the path to the project's indexed root and refuses anything
 * outside it — this call carries no authority of its own. Resolves to an error
 * message on refusal, or null on success, so callers can surface the reason. */
export async function openPath(
  project: string,
  path: string,
  kind: "file" | "folder",
): Promise<string | null> {
  try {
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, path, kind }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.error ?? `HTTP ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : "request failed";
  }
}
