(async function () {
  const base = "http://localhost:5000";
  const prov = {
    first_name: "DBG",
    last_name: "Provider",
    email: "dbg.provider+test@example.com",
    phone: "01799998888",
    password: "Passw0rd!",
    role: "provider",
    nid: "1234567890",
  };
  try {
    console.log("Registering provider...");
    let r = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prov),
    });
    let jb;
    try {
      jb = await r.json();
    } catch (e) {
      jb = { text: await r.text() };
    }
    console.log("REGISTER status", r.status, "body", jb);
  } catch (err) {
    console.error("Register request failed", err);
  }

  try {
    console.log("Logging in provider...");
    let r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: prov.email, password: prov.password }),
    });
    const body = await r.json();
    console.log("LOGIN status", r.status, "body", body);
    if (!r.ok) return;
    const token = body.token;

    console.log("Fetching provider bookings with token...");
    let rb = await fetch(base + "/api/bookings/provider", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    try {
      var jb2 = await rb.json();
    } catch (e) {
      jb2 = { text: await rb.text() };
    }
    console.log("PROVIDER BOOKINGS status", rb.status, "body", jb2);
  } catch (err) {
    console.error("Login/bookings flow failed", err);
  }
})();
