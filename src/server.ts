import { WebSocketServer, WebSocket } from "ws";
import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import http from "http";
import { readFile } from "fs/promises";

function now(): number {
  return Date.now();
}

setInterval(() => {
  console.log("Server time:", now());
}, 1000);

if (!existsSync("./db")) {
  mkdirSync("./db");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello, World!");
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

const wss = new WebSocketServer({ server });

const watchers = new Map<string, Set<WebSocket>>();


wss.on("connection", (ws) => {
  ws.on("message", (buffer) => {
    const message = JSON.parse(buffer.toString());
    switch (message.$) {

      case "get_time":
        ws.send(JSON.stringify({ $: "info_time", time: now() }));
        break;

      case "post": {
        const server_time = now();
        const client_time = message.time;
        const room        = message.room;
        const name        = message.name;
        const data        = message.data;
        const path        = `./db/${room}.jsonl`; // database

        let index = 0;

        if (existsSync(path)) {
          const content = readFileSync(path, "utf-8");
          const lines   = content.trim().split("\n").filter(l => l.trim());
          index = lines.length;
        }

        const file_line = JSON.stringify({ server_time, client_time, name, data });
        appendFileSync(path, file_line + "\n");
        console.log("Post received:", { room, data }); // remove in production

        const room_watchers = watchers.get(room);
        if (room_watchers) {
          const info = { $: "info_post", room, index, server_time, client_time, name, data };
          const post = JSON.stringify(info);
          for (const watcher of room_watchers) {
            watcher.send(post);
          }
        }
        break;
      }

      case "load": {
        const room = message.room;
        const from = Math.max(0, message.from || 0);
        const path = `./db/${room}.jsonl`; // database
        if (existsSync(path)) {
          const content = readFileSync(path, "utf-8");
          const lines   = content.trim().split("\n").filter(l => l.trim());
          for (let index = from; index < lines.length; index++) {
            const line = lines[index];
            if (line) {
              const record      = JSON.parse(line);
              const server_time = record.server_time;
              const client_time = record.client_time;
              const name        = record.name;
              const data        = record.data;
              const msg         = { $: "info_post", room, index, server_time, client_time, name, data };
              ws.send(JSON.stringify(msg));
            }
          }
        }
        break;
      }

      case "watch": {
        const room = message.room;

        if (!watchers.has(room)) {
          watchers.set(room, new Set());
        }

        watchers.get(room)!.add(ws);
        console.log("Watching:", { room });
        break;
      }

      case "unwatch": {
        const room = message.room;
        const set  = watchers.get(room);

        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            watchers.delete(room);
          }
        }

        console.log("Unwatching:", { room });
        break;
      }

    }
  });

  ws.on("close", () => {
    for (const [room, set] of watchers.entries()) {
      set.delete(ws);
      if (set.size === 0) watchers.delete(room);
    }
  });
});

server.listen(8080, () => {
  console.log("Server running at http://localhost:8080 (HTTP + WebSocket)");
});
