(function () {
  function computeApiBaseUrl() {
    const configured = window.SERVIIO_API_BASE_URL;
    if (configured) return String(configured).replace(/\/$/, "");

    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (window.location.protocol === "file:" || isLocalhost) {
      return "http://localhost:5000";
    }
    return window.location.origin;
  }

  const apiBaseUrl = computeApiBaseUrl();

  function rewriteUrl(input) {
    if (typeof input !== "string") return input;
    return input.replace(/^http:\/\/localhost:5000/, apiBaseUrl);
  }

  window.Serviio = {
    ...(window.Serviio || {}),
    apiBaseUrl,
    rewriteUrl,
    apiUrl(path = "") {
      const suffix = String(path || "");
      if (/^https?:\/\//i.test(suffix)) return rewriteUrl(suffix);
      return `${apiBaseUrl}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
    },
    getToken() {
      return localStorage.getItem("serviio_token");
    },
    getUser() {
      try {
        return JSON.parse(localStorage.getItem("serviio_user") || "null");
      } catch (error) {
        return null;
      }
    },
    clearSession() {
      localStorage.removeItem("serviio_token");
      localStorage.removeItem("serviio_user");
    },
    safeNext(pathname) {
      const raw = String(pathname || "").trim();
      if (
        !raw ||
        raw.startsWith("http://") ||
        raw.startsWith("https://") ||
        raw.startsWith("//") ||
        raw.startsWith("\\")
      ) {
        return "home.html";
      }
      return raw.replace(/^\/+/, "") || "home.html";
    },
    requireAuth(options = {}) {
      const token = this.getToken();
      const user = this.getUser();
      const roles = Array.isArray(options.roles)
        ? options.roles.map((role) => String(role).toLowerCase())
        : [];
      const next = this.safeNext(
        options.next ||
          `${window.location.pathname.split("/").pop()}${window.location.search}`,
      );
      const role = String(user?.role || "").toLowerCase();
      const isAllowed = token && user && (!roles.length || roles.includes(role));

      if (!isAllowed) {
        this.clearSession();
        window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
        return { token: null, user: null, allowed: false };
      }

      return { token, user, allowed: true };
    },
    notify(message, type = "info", options = {}) {
      const text = String(message || "").trim();
      if (!text) return null;

      let region = document.getElementById("serviioToastRegion");
      if (!region) {
        region = document.createElement("div");
        region.id = "serviioToastRegion";
        region.className = "serviio-toast-region";
        region.setAttribute("aria-live", "polite");
        region.setAttribute("aria-atomic", "false");
        document.body.appendChild(region);
      }

      const toast = document.createElement("div");
      toast.className = `serviio-toast serviio-toast-${type}`;
      toast.setAttribute("role", type === "error" ? "alert" : "status");
      toast.textContent = text;
      region.appendChild(toast);

      const duration = Number(options.duration || 4200);
      window.setTimeout(() => {
        toast.classList.add("is-hiding");
        window.setTimeout(() => toast.remove(), 220);
      }, duration);

      return toast;
    },
  };

  if (!window.getApiBaseUrl) {
    window.getApiBaseUrl = () => apiBaseUrl;
  }

  if (window.fetch && !window.fetch.__serviioWrapped) {
    const nativeFetch = window.fetch.bind(window);
    const wrappedFetch = (input, init) => {
      if (typeof input === "string") {
        return nativeFetch(rewriteUrl(input), init);
      }
      if (input instanceof Request) {
        return nativeFetch(new Request(rewriteUrl(input.url), input), init);
      }
      return nativeFetch(input, init);
    };
    wrappedFetch.__serviioWrapped = true;
    window.fetch = wrappedFetch;
  }

  if (!Object.prototype.hasOwnProperty.call(window, "__serviioIoWrapped")) {
    let socketIo = window.io;
    Object.defineProperty(window, "io", {
      configurable: true,
      get() {
        return socketIo;
      },
      set(value) {
        if (typeof value !== "function") {
          socketIo = value;
          return;
        }
        socketIo = function wrappedIo(url, options) {
          if (typeof url === "string") {
            return value(rewriteUrl(url), options);
          }
          return value(url, options);
        };
      },
    });
    window.__serviioIoWrapped = true;
  }
})();
