var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/network/client.ts
var client_exports = {};
__export(client_exports, {
  close: () => close,
  gen_name: () => gen_name,
  load: () => load,
  on_sync: () => on_sync,
  ping: () => ping,
  post: () => post,
  send: () => send,
  server_time: () => server_time,
  unwatch: () => unwatch,
  watch: () => watch
});
var time_sync = {
  clock_offset: Infinity,
  lowest_ping: Infinity,
  request_sent_at: 0,
  last_ping: Infinity
};
var ws = new WebSocket(`ws://${window.location.hostname}:8080`);
var room_watchers = /* @__PURE__ */ new Map();
var is_synced = false;
var sync_listeners = [];
function now() {
  return Math.floor(Date.now());
}
function server_time() {
  if (!isFinite(time_sync.clock_offset)) {
    throw new Error("server_time() called before initial sync");
  }
  return Math.floor(now() + time_sync.clock_offset);
}
function ensure_open() {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not open");
  }
}
function send(obj) {
  ensure_open();
  ws.send(JSON.stringify(obj));
}
function register_handler(room, handler) {
  if (!handler) {
    return;
  }
  if (room_watchers.has(room)) {
    throw new Error(`Handler already registered for room: ${room}`);
  }
  room_watchers.set(room, handler);
}
ws.addEventListener("open", () => {
  console.log("[WS] Connected");
  time_sync.request_sent_at = now();
  ws.send(JSON.stringify({ $: "get_time" }));
  setInterval(() => {
    time_sync.request_sent_at = now();
    ws.send(JSON.stringify({ $: "get_time" }));
  }, 2e3);
});
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.$) {
    case "info_time": {
      const t = now();
      const ping2 = t - time_sync.request_sent_at;
      time_sync.last_ping = ping2;
      if (ping2 < time_sync.lowest_ping) {
        const local_avg = Math.floor((time_sync.request_sent_at + t) / 2);
        time_sync.clock_offset = msg.time - local_avg;
        time_sync.lowest_ping = ping2;
      }
      if (!is_synced) {
        is_synced = true;
        for (const cb of sync_listeners) {
          cb();
        }
        sync_listeners.length = 0;
      }
      break;
    }
    case "info_post": {
      const handler = room_watchers.get(msg.room);
      if (handler) {
        handler(msg);
      }
      break;
    }
  }
});
function gen_name() {
  const alphabet = "_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
  const bytes = new Uint8Array(8);
  const can_crypto = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
  if (can_crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % 64];
  }
  return out;
}
function post(room, data) {
  const name = gen_name();
  send({ $: "post", room, time: server_time(), name, data });
  return name;
}
function load(room, from = 0, handler) {
  register_handler(room, handler);
  send({ $: "load", room, from });
}
function watch(room, handler) {
  register_handler(room, handler);
  send({ $: "watch", room });
}
function unwatch(room) {
  room_watchers.delete(room);
  send({ $: "unwatch", room });
}
function close() {
  ws.close();
}
function on_sync(callback) {
  if (is_synced) {
    callback();
    return;
  }
  sync_listeners.push(callback);
}
function ping() {
  return time_sync.last_ping;
}

// src/engine/vibi.ts
var Vibi = class {
  constructor(room, init, on_tick2, on_post2, smooth, tick_rate, tolerance) {
    __publicField(this, "room");
    __publicField(this, "init");
    __publicField(this, "on_tick");
    __publicField(this, "on_post");
    __publicField(this, "smooth");
    __publicField(this, "tick_rate");
    __publicField(this, "tolerance");
    __publicField(this, "room_posts");
    __publicField(this, "local_posts");
    // predicted local posts keyed by name
    __publicField(this, "state_cache");
    // cached states keyed by tick offset
    __publicField(this, "cache_start");
    // tick corresponding to state_cache[0]
    __publicField(this, "timeline");
    this.room = room;
    this.init = init;
    this.on_tick = on_tick2;
    this.on_post = on_post2;
    this.smooth = smooth;
    this.tick_rate = tick_rate;
    this.tolerance = tolerance;
    this.room_posts = /* @__PURE__ */ new Map();
    this.local_posts = /* @__PURE__ */ new Map();
    this.state_cache = [];
    this.cache_start = null;
    this.timeline = null;
    on_sync(() => {
      console.log(`[VIBI] synced; watching+loading room=${this.room}`);
      watch(this.room, (post2) => {
        const official_tick = this.official_tick(post2);
        if (post2.name && this.local_posts.has(post2.name)) {
          this.local_posts.delete(post2.name);
        }
        this.room_posts.set(post2.index, post2);
        this.invalidate_cache(official_tick);
      });
      load(this.room, 0);
    });
  }
  // cached timeline of posts per tick
  // Compute the authoritative time a post takes effect.
  official_time(post2) {
    if (post2.client_time <= post2.server_time - this.tolerance) {
      return post2.server_time - this.tolerance;
    } else {
      return post2.client_time;
    }
  }
  // Convert a post into its authoritative tick.
  official_tick(post2) {
    return this.time_to_tick(this.official_time(post2));
  }
  // Reset all cached states.
  reset_cache() {
    this.state_cache.length = 0;
    this.cache_start = null;
  }
  // Drop cached states from the provided tick (inclusive) onward.
  invalidate_cache(from_tick) {
    this.invalidate_timeline();
    if (this.cache_start === null) {
      return;
    }
    const drop_from = from_tick - this.cache_start;
    if (drop_from <= 0) {
      this.reset_cache();
      return;
    }
    if (drop_from < this.state_cache.length) {
      this.state_cache.length = drop_from;
    }
  }
  // Invalidate the cached timeline so it will be rebuilt lazily.
  invalidate_timeline() {
    this.timeline = null;
  }
  // No extra helpers needed with local_posts: simplicity preserved
  time_to_tick(server_time2) {
    return Math.floor(server_time2 * this.tick_rate / 1e3);
  }
  server_time() {
    return server_time();
  }
  server_tick() {
    return this.time_to_tick(this.server_time());
  }
  // Total official posts loaded for this room
  post_count() {
    return this.room_posts.size;
  }
  // Compute a render-ready state by blending authoritative past and current
  // using the provided smooth(past, curr) function.
  compute_render_state() {
    const curr_tick = this.server_tick();
    const tick_ms = 1e3 / this.tick_rate;
    const tol_ticks = Math.ceil(this.tolerance / tick_ms);
    const rtt_ms = ping();
    const half_rtt = isFinite(rtt_ms) ? Math.ceil(rtt_ms / 2 / tick_ms) : 0;
    const past_ticks = Math.max(tol_ticks, half_rtt + 1);
    const past_tick = Math.max(0, curr_tick - past_ticks);
    const past_state = this.compute_state_at(past_tick);
    const curr_state = this.compute_state_at(curr_tick);
    return this.smooth(past_state, curr_state);
  }
  initial_time() {
    const post2 = this.room_posts.get(0);
    if (!post2) {
      return null;
    }
    return this.official_time(post2);
  }
  initial_tick() {
    const t = this.initial_time();
    if (t === null) {
      return null;
    }
    return this.time_to_tick(t);
  }
  build_timeline() {
    if (this.timeline) {
      return this.timeline;
    }
    const timeline = /* @__PURE__ */ new Map();
    for (const post2 of this.room_posts.values()) {
      const official_tick = this.official_tick(post2);
      if (!timeline.has(official_tick)) {
        timeline.set(official_tick, []);
      }
      timeline.get(official_tick).push(post2);
    }
    for (const post2 of this.local_posts.values()) {
      const official_tick = this.official_tick(post2);
      if (!timeline.has(official_tick)) {
        timeline.set(official_tick, []);
      }
      const local_queued = { ...post2, index: Number.MAX_SAFE_INTEGER };
      timeline.get(official_tick).push(local_queued);
    }
    for (const posts of timeline.values()) {
      posts.sort((a, b) => a.index - b.index);
    }
    this.timeline = timeline;
    return timeline;
  }
  compute_state_at(at_tick) {
    const initial_tick = this.initial_tick();
    if (initial_tick === null) {
      this.reset_cache();
      return this.init;
    }
    if (at_tick < initial_tick) {
      return this.init;
    }
    if (this.cache_start !== initial_tick) {
      this.state_cache.length = 0;
      this.cache_start = initial_tick;
    }
    const timeline = this.build_timeline();
    let state = this.init;
    let start_tick = initial_tick;
    if (this.cache_start !== null && this.state_cache.length > 0) {
      const highest_cached_tick = this.cache_start + this.state_cache.length - 1;
      const usable_cached_tick = Math.min(highest_cached_tick, at_tick);
      const cache_index = usable_cached_tick - this.cache_start;
      if (cache_index >= 0) {
        state = this.state_cache[cache_index];
        start_tick = usable_cached_tick + 1;
        if (start_tick > at_tick) {
          return state;
        }
      }
    }
    for (let tick = start_tick; tick <= at_tick; tick++) {
      state = this.on_tick(state);
      const posts = timeline.get(tick) || [];
      for (const post2 of posts) {
        state = this.on_post(post2.data, state);
      }
      if (this.cache_start !== null) {
        const cacheIndex = tick - this.cache_start;
        if (cacheIndex === this.state_cache.length) {
          this.state_cache.push(state);
        } else if (cacheIndex >= 0 && cacheIndex < this.state_cache.length) {
          this.state_cache[cacheIndex] = state;
        }
      }
    }
    return state;
  }
  // Post data to the room
  post(data) {
    const name = post(this.room, data);
    const t = this.server_time();
    const local_post = {
      room: this.room,
      index: -1,
      server_time: t,
      client_time: t,
      name,
      data
    };
    this.local_posts.set(name, local_post);
    this.invalidate_cache(this.official_tick(local_post));
  }
  compute_current_state() {
    return this.compute_state_at(this.server_tick());
  }
};

// src/game/index.ts
var TICK_RATE = 24;
var TOLERANCE = 10;
var TILE_SIZE = 24;
var WORLD_COLS = 40;
var WORLD_ROWS = 22;
var WORLD_WIDTH = TILE_SIZE * WORLD_COLS;
var WORLD_HEIGHT = TILE_SIZE * WORLD_ROWS;
var PIXELS_PER_SECOND = TILE_SIZE * 6;
var PIXELS_PER_TICK = PIXELS_PER_SECOND / TICK_RATE;
var HALF_TILE = TILE_SIZE / 2;
var initial = {};
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function tileCenterFromIndex(index) {
  return index * TILE_SIZE + HALF_TILE;
}
function nearestTileIndex(value, maxIndex) {
  const snapped = Math.round((value - HALF_TILE) / TILE_SIZE);
  return clamp(snapped, 0, maxIndex);
}
function pickDirection(player) {
  if (player.w) return "w";
  if (player.a) return "a";
  if (player.s) return "s";
  if (player.d) return "d";
  return null;
}
function stepToward(current, target) {
  const delta = target - current;
  if (Math.abs(delta) <= PIXELS_PER_TICK) {
    return target;
  }
  return current + Math.sign(delta) * PIXELS_PER_TICK;
}
function on_tick(state) {
  const next = {};
  for (const [nick, player] of Object.entries(state)) {
    if (!player) continue;
    let { px, py, tx, ty, moving } = player;
    if (Math.abs(px - tx) < 1e-3 && Math.abs(py - ty) < 1e-3) {
      px = tx;
      py = ty;
      moving = false;
    }
    if (!moving) {
      const dir = pickDirection(player);
      if (dir) {
        const tileX = nearestTileIndex(tx, WORLD_COLS - 1);
        const tileY = nearestTileIndex(ty, WORLD_ROWS - 1);
        let nextTileX = tileX;
        let nextTileY = tileY;
        switch (dir) {
          case "w":
            nextTileY = clamp(tileY - 1, 0, WORLD_ROWS - 1);
            break;
          case "a":
            nextTileX = clamp(tileX - 1, 0, WORLD_COLS - 1);
            break;
          case "s":
            nextTileY = clamp(tileY + 1, 0, WORLD_ROWS - 1);
            break;
          case "d":
            nextTileX = clamp(tileX + 1, 0, WORLD_COLS - 1);
            break;
        }
        const nextTx = tileCenterFromIndex(nextTileX);
        const nextTy = tileCenterFromIndex(nextTileY);
        if (nextTx !== tx || nextTy !== ty) {
          tx = nextTx;
          ty = nextTy;
          moving = true;
        }
      }
    }
    if (moving) {
      px = stepToward(px, tx);
      py = stepToward(py, ty);
      if (Math.abs(px - tx) < 1e-3 && Math.abs(py - ty) < 1e-3) {
        px = tx;
        py = ty;
        moving = false;
      }
    }
    next[nick] = {
      px,
      py,
      tx,
      ty,
      moving,
      w: player.w,
      a: player.a,
      s: player.s,
      d: player.d
    };
  }
  return next;
}
function on_post(post2, state) {
  switch (post2.$) {
    case "spawn": {
      if (state[post2.nick]) {
        return state;
      }
      const player = {
        px: tileCenterFromIndex(nearestTileIndex(post2.px, WORLD_COLS - 1)),
        py: tileCenterFromIndex(nearestTileIndex(post2.py, WORLD_ROWS - 1)),
        tx: tileCenterFromIndex(nearestTileIndex(post2.px, WORLD_COLS - 1)),
        ty: tileCenterFromIndex(nearestTileIndex(post2.py, WORLD_ROWS - 1)),
        moving: false,
        w: 0,
        a: 0,
        s: 0,
        d: 0
      };
      return { ...state, [post2.nick]: player };
    }
    case "down": {
      const target = state[post2.player];
      if (!target) return state;
      const updated = { ...target, [post2.key]: 1 };
      return { ...state, [post2.player]: updated };
    }
    case "up": {
      const target = state[post2.player];
      if (!target) return state;
      const updated = { ...target, [post2.key]: 0 };
      return { ...state, [post2.player]: updated };
    }
  }
  return state;
}
function createGame(room, smooth) {
  return new Vibi(room, initial, on_tick, on_post, smooth, TICK_RATE, TOLERANCE);
}
function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.id = "game";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.display = "block";
  canvas.style.background = "#d9e0ea";
  return canvas;
}
function resizeCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function drawGrid(ctx, canvas) {
  const scaleX = canvas.width / WORLD_WIDTH;
  const scaleY = canvas.height / WORLD_HEIGHT;
  const tileW = TILE_SIZE * scaleX;
  const tileH = TILE_SIZE * scaleY;
  const toneA = "#c5d4df";
  const toneB = "#b7c8d5";
  for (let row = 0; row < WORLD_ROWS; row++) {
    for (let col = 0; col < WORLD_COLS; col++) {
      const color = (row + col) % 2 === 0 ? toneA : toneB;
      ctx.fillStyle = color;
      ctx.fillRect(col * tileW, row * tileH, tileW, tileH);
    }
  }
  ctx.strokeStyle = "#8aa0b0";
  ctx.lineWidth = 1;
  for (let c = 0; c <= WORLD_COLS; c++) {
    const x = Math.floor(c * tileW) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let r = 0; r <= WORLD_ROWS; r++) {
    const y = Math.floor(r * tileH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}
function drawPlayer(ctx, canvas, nick, player, isSelf) {
  const scaleX = canvas.width / WORLD_WIDTH;
  const scaleY = canvas.height / WORLD_HEIGHT;
  const spriteW = TILE_SIZE * scaleX;
  const spriteH = TILE_SIZE * scaleY;
  const x = player.px * scaleX - spriteW / 2;
  const y = player.py * scaleY - spriteH / 2;
  ctx.fillStyle = isSelf ? "#e2574c" : "#3a6ea5";
  ctx.fillRect(x + spriteW * 0.1, y + spriteH * 0.35, spriteW * 0.8, spriteH * 0.5);
  ctx.fillStyle = "#2b2d42";
  ctx.fillRect(x + spriteW * 0.2, y + spriteH * 0.15, spriteW * 0.6, spriteH * 0.25);
  ctx.fillStyle = "#f4d3ae";
  ctx.fillRect(x + spriteW * 0.35, y + spriteH * 0.32, spriteW * 0.3, spriteH * 0.2);
  ctx.fillStyle = "#111";
  ctx.fillRect(x + spriteW * 0.25, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);
  ctx.fillRect(x + spriteW * 0.55, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);
  ctx.fillStyle = "#0f172a";
  ctx.font = `${Math.max(10, Math.floor(spriteH * 0.35))}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(nick, x + spriteW / 2, y - spriteH * 0.35);
}
function render(game, ctx, canvas, room, nick) {
  drawGrid(ctx, canvas);
  const state = game.compute_render_state();
  for (const [id, player] of Object.entries(state)) {
    if (!player) continue;
    drawPlayer(ctx, canvas, id, player, id === nick);
  }
  ctx.fillStyle = "#0f172a";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const serverTick = game.server_tick();
  const rtt = ping();
  ctx.fillText(`room: ${room}`, 12, 12);
  ctx.fillText(`tick: ${serverTick}`, 12, 30);
  if (isFinite(rtt)) {
    ctx.fillText(`ping: ${Math.round(rtt)} ms`, 12, 48);
  }
  ctx.fillText("WASD to move", 12, 66);
}
var started = false;
function startGame() {
  if (started) return;
  started = true;
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container");
  }
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = false;
  container.innerHTML = "";
  container.appendChild(canvas);
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));
  let room = prompt("Enter room name:") || "";
  room = room.trim() || gen_name();
  let nick = "";
  while (true) {
    const input = prompt("Enter your nickname (1-14 characters):") || "";
    const trimmed = input.trim();
    if (trimmed.length === 0 || trimmed.length > 14) {
      alert("Nickname must be between 1 and 14 characters.");
      continue;
    }
    nick = trimmed;
    break;
  }
  document.title = `Pokemon Grid (${room})`;
  const smooth = (past, curr) => {
    if (curr[nick]) {
      past[nick] = curr[nick];
    }
    return past;
  };
  const game = createGame(room, smooth);
  const keyStates = {
    w: false,
    a: false,
    s: false,
    d: false
  };
  on_sync(() => {
    const spawnX = Math.floor(WORLD_WIDTH / 2);
    const spawnY = Math.floor(WORLD_HEIGHT / 2);
    game.post({ $: "spawn", nick, px: spawnX, py: spawnY });
    const validKeys = /* @__PURE__ */ new Set(["w", "a", "s", "d"]);
    const handleKeyEvent = (event) => {
      const key = event.key.toLowerCase();
      if (!validKeys.has(key)) return;
      const isDown = event.type === "keydown";
      const keyName = key;
      if (keyStates[keyName] === isDown) return;
      keyStates[keyName] = isDown;
      const action = isDown ? "down" : "up";
      game.post({ $: action, key: keyName, player: nick });
    };
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    const step = () => {
      render(game, ctx, canvas, room, nick);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
if (typeof window !== "undefined") {
  startGame();
}
export {
  Vibi,
  createGame,
  startGame,
  client_exports as syncClient
};
//# sourceMappingURL=index.js.map
