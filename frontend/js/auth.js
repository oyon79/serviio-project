const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("loginSubmitButton");

function getApiBaseUrl() {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (window.location.protocol === "file:" || isLocalhost) {
    return "http://localhost:5000";
  }
  return window.location.origin;
}

function getLoginMessageElement() {
  let messageEl = document.getElementById("loginMessage");
  if (!messageEl && loginForm) {
    messageEl = document.createElement("div");
    messageEl.id = "loginMessage";
    messageEl.style.marginTop = "1rem";
    messageEl.style.color = "#d32f2f";
    messageEl.style.fontSize = "0.95rem";
    loginForm.appendChild(messageEl);
  }
  return messageEl;
}

function showMessage(text, isError = true) {
  const messageEl = getLoginMessageElement();
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d32f2f" : "#2e7d32";
}

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Signing in..." : "Sign In →";
}

function getRedirectUrl(user) {
  const role = user && user.role ? user.role.toLowerCase() : "customer";
  if (role === "provider") return "profileBooking.html";
  if (role === "admin") return "admin.html";
  return "home.html";
}

async function handleLogin(event) {
  event.preventDefault();
  showMessage("");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Please enter both email and password.");
    return;
  }

  setLoading(true);
  const apiUrl = `${getApiBaseUrl()}/api/auth/login`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage(
        data.message || "Login failed. Please check your credentials.",
      );
      return;
    }

    localStorage.setItem("serviio_token", data.token);
    localStorage.setItem("serviio_user", JSON.stringify(data.user || {}));

    showMessage("Login successful. Redirecting...", false);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Honor `next` query param for post-login redirection (e.g., login.html?next=providerList.html)
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) {
      // Basic sanitation: only allow local paths within the frontend
      if (next.startsWith("http://") || next.startsWith("https://")) {
        window.location.href = getRedirectUrl(data.user);
      } else {
        window.location.href = next;
      }
    } else {
      window.location.href = getRedirectUrl(data.user);
    }
  } catch (error) {
    console.error("Login request failed:", error);
    showMessage("Unable to reach the server. Please try again later.");
  } finally {
    setLoading(false);
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
}
