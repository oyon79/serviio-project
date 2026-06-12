const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.SERVIIO_SKIP_DB_HEALTHCHECK = "true";

const db = require("../config/db");
const attachTrackingSocket = require("../sockets/trackingSocket");

const SECRET = "socket-test-secret-with-enough-length";

test.after(async () => {
  await db.end().catch(() => {});
});

function createFakeIo() {
  const io = {
    connectionHandler: null,
    roomEvents: [],
    on(eventName, handler) {
      if (eventName === "connection") {
        this.connectionHandler = handler;
      }
    },
    to(room) {
      return {
        emit: (eventName, payload) => {
          this.roomEvents.push({ room, eventName, payload });
        },
      };
    },
  };
  attachTrackingSocket(io);
  return io;
}

function createFakeSocket(token) {
  return {
    id: "socket-test",
    handshake: { auth: token ? { token } : {}, query: {}, headers: {} },
    handlers: new Map(),
    emitted: [],
    joinedRooms: [],
    on(eventName, handler) {
      this.handlers.set(eventName, handler);
    },
    emit(eventName, payload) {
      this.emitted.push({ eventName, payload });
    },
    join(room) {
      this.joinedRooms.push(room);
    },
  };
}

function tokenFor(user) {
  return jwt.sign(user, SECRET, { expiresIn: "5m" });
}

async function withStubbedDbQuery(handler) {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT customer_id, provider_id FROM bookings/i.test(sql)) {
      return [[{ customer_id: 11, provider_id: 22 }]];
    }
    if (/INSERT INTO provider_locations/i.test(sql)) {
      return [{ affectedRows: 1 }];
    }
    return [[]];
  };

  try {
    await handler(calls);
  } finally {
    db.query = originalQuery;
  }
}

test("super admins can join booking rooms through realtime access checks", async () => {
  process.env.JWT_SECRET = SECRET;
  await withStubbedDbQuery(async () => {
    const io = createFakeIo();
    const socket = createFakeSocket(tokenFor({ id: 99, role: "super_admin" }));
    io.connectionHandler(socket);

    await socket.handlers.get("booking:join")({ bookingId: 123 });

    assert.deepEqual(socket.joinedRooms, ["booking_room:123"]);
    assert.deepEqual(socket.emitted, [
      { eventName: "booking:joined", payload: { bookingId: 123 } },
    ]);
  });
});

test("users cannot join unrelated booking rooms", async () => {
  process.env.JWT_SECRET = SECRET;
  await withStubbedDbQuery(async () => {
    const io = createFakeIo();
    const socket = createFakeSocket(tokenFor({ id: 44, role: "customer" }));
    io.connectionHandler(socket);

    await socket.handlers.get("booking:join")({ bookingId: 123 });

    assert.deepEqual(socket.joinedRooms, []);
    assert.equal(socket.emitted[0].eventName, "socket:error");
    assert.equal(socket.emitted[0].payload.event, "booking:join");
  });
});

test("provider location updates broadcast and persist only for assigned providers", async () => {
  process.env.JWT_SECRET = SECRET;
  await withStubbedDbQuery(async (calls) => {
    const io = createFakeIo();
    const socket = createFakeSocket(tokenFor({ id: 22, role: "provider" }));
    io.connectionHandler(socket);

    await socket.handlers.get("location_update")({
      bookingId: 123,
      providerId: 22,
      lat: 23.8103,
      lng: 90.4125,
      accuracy: 12,
    });

    assert.equal(io.roomEvents.length, 1);
    assert.equal(io.roomEvents[0].room, "booking_room:123");
    assert.equal(io.roomEvents[0].eventName, "location_update");
    assert.equal(io.roomEvents[0].payload.providerId, 22);
    assert.equal(io.roomEvents[0].payload.lat, 23.8103);
    assert.equal(io.roomEvents[0].payload.lng, 90.4125);
    assert.ok(
      calls.some(({ sql }) => /INSERT INTO provider_locations/i.test(sql)),
      "provider location should be persisted",
    );
  });
});

test("invalid provider coordinates are ignored without broadcasting", async () => {
  process.env.JWT_SECRET = SECRET;
  await withStubbedDbQuery(async (calls) => {
    const io = createFakeIo();
    const socket = createFakeSocket(tokenFor({ id: 22, role: "provider" }));
    io.connectionHandler(socket);

    await socket.handlers.get("location_update")({
      bookingId: 123,
      providerId: 22,
      lat: 1234,
      lng: 90.4125,
    });

    assert.equal(io.roomEvents.length, 0);
    assert.ok(
      !calls.some(({ sql }) => /INSERT INTO provider_locations/i.test(sql)),
      "invalid coordinates should not be persisted",
    );
  });
});
