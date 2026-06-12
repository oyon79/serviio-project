const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotEmailInput = document.getElementById("forgotEmail");
const forgotPhoneInput = document.getElementById("forgotPhone");
const forgotSubmitButton = document.getElementById("forgotSubmitButton");

function getApiBaseUrl() {
  return window.Serviio?.apiBaseUrl || window.location.origin;
}

function getForgotMessageElement() {
  let messageEl = document.getElementById("forgotMessage");
  if (!messageEl && forgotPasswordForm) {
    messageEl = document.createElement("div");
    messageEl.id = "forgotMessage";
    messageEl.style.marginTop = "1rem";
    messageEl.style.fontSize = "0.95rem";
    forgotPasswordForm.appendChild(messageEl);
  }
  return messageEl;
}

function showForgotMessage(text, isError = true) {
  const messageEl = getForgotMessageElement();
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d32f2f" : "#2e7d32";
}

function setForgotLoading(isLoading) {
  if (!forgotSubmitButton) return;
  forgotSubmitButton.disabled = isLoading;
  forgotSubmitButton.textContent = isLoading ? "Sending..." : "Send Reset Code";
}

async function handleForgotPassword(event) {
  event.preventDefault();
  showForgotMessage("");

  const email = forgotEmailInput.value.trim();
  const phone = forgotPhoneInput.value.trim();

  if (!email) {
    showForgotMessage("Please enter the email address for your account.");
    return;
  }

  setForgotLoading(true);
  const apiUrl = `${getApiBaseUrl()}/api/auth/forgot-password`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, phone }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      showForgotMessage(
        data.message || "Unable to submit password reset request.",
      );
      return;
    }

    let message =
      data.message ||
      "If an account exists, password reset instructions have been sent.";
    if (data.resetUrl) {
      message += "\nUse this link to reset your password: ";
      const link = document.createElement("a");
      link.href = data.resetUrl;
      link.textContent = "Reset Password";
      link.style.display = "block";
      link.style.marginTop = "0.5rem";
      link.style.color = "#1565c0";

      showForgotMessage(message, false);
      const messageEl = getForgotMessageElement();
      if (messageEl) {
        messageEl.textContent = message;
        messageEl.appendChild(document.createElement("br"));
        messageEl.appendChild(link);
        if (data.otp) {
          const otpEl = document.createElement("div");
          otpEl.textContent = `Development reset code: ${data.otp}`;
          otpEl.style.marginTop = "0.5rem";
          otpEl.style.fontWeight = "700";
          messageEl.appendChild(otpEl);
        }
      }
      return;
    }

    showForgotMessage(message, false);
  } catch (error) {
    console.error("Forgot password request failed:", error);
    showForgotMessage("Unable to reach the server. Please try again later.");
  } finally {
    setForgotLoading(false);
  }
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", handleForgotPassword);
}
