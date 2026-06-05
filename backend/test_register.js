(async () => {
  try {
    const email = `auto${Date.now()}@example.com`;
    const res = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: "Auto",
        last_name: "User",
        email,
        password: "Pass1234",
      }),
    });
    const text = await res.text();
    console.log("STATUS", res.status);
    console.log("BODY", text);
  } catch (err) {
    console.error("ERROR", err);
  }
})();
