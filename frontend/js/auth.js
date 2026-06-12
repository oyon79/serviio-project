const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("loginSubmitButton");

function getApiBaseUrl() {
  return window.Serviio?.apiBaseUrl || window.location.origin;
}

function safeNext(pathname) {
  if (window.Serviio?.safeNext) return window.Serviio.safeNext(pathname);
  const raw = String(pathname || "").trim();
  if (
    !raw ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("//") ||
    raw.startsWith("\\")
  ) {
    return "";
  }
  return raw.replace(/^\/+/, "");
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
  submitButton.textContent = isLoading ? "Signing in..." : "Sign In ->";
}

function getRedirectUrl(user) {
  const role = user && user.role ? user.role.toLowerCase() : "customer";
  if (role === "provider") return "profileBooking.html";
  if (
    role === "admin" ||
    role === "super_admin" ||
    role === "support_agent" ||
    role === "verification_officer"
  ) {
    return "admin.html";
  }
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
      if (data.verification_required && data.email) {
        sessionStorage.setItem("serviio_pending_verification_email", data.email);
        setTimeout(() => {
          window.location.href = `verify-registration.html?email=${encodeURIComponent(data.email)}`;
        }, 900);
      }
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
      const safeRedirect = safeNext(next);
      if (!safeRedirect) {
        window.location.href = getRedirectUrl(data.user);
      } else {
        window.location.href = safeRedirect;
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
