const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetOtpInput = document.getElementById("resetOtp");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const resetSubmitButton = document.getElementById("resetSubmitButton");
const resetHint = document.getElementById("resetHint");

function getApiBaseUrl() {
  return window.Serviio?.apiBaseUrl || window.location.origin;
}

function getResetMessageElement() {
  let messageEl = document.getElementById("resetMessage");
  if (!messageEl && resetPasswordForm) {
    messageEl = document.createElement("div");
    messageEl.id = "resetMessage";
    messageEl.style.marginTop = "1rem";
    messageEl.style.fontSize = "0.95rem";
    resetPasswordForm.appendChild(messageEl);
  }
  return messageEl;
}

function showResetMessage(text, isError = true) {
  const messageEl = getResetMessageElement();
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d32f2f" : "#2e7d32";
}

function setResetLoading(isLoading) {
  if (!resetSubmitButton) return;
  resetSubmitButton.disabled = isLoading;
  resetSubmitButton.textContent = isLoading ? "Resetting..." : "Reset Password";
}

function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

async function validateResetToken(token) {
  const apiUrl = `${getApiBaseUrl()}/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`;
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    if (!response.ok || !data.success) {
      showResetMessage(
        data.message || "Invalid or expired password reset link.",
      );
      resetPasswordForm.style.display = "none";
      return false;
    }

    if (resetHint) {
      resetHint.textContent = data.otp_required
        ? `Reset password for ${data.email}. Enter the one-time code from your reset email.`
        : `Reset password for ${data.email}.`;
    }
    return true;
  } catch (error) {
    console.error("Reset token validation failed:", error);
    showResetMessage("Unable to verify reset link. Please try again later.");
    resetPasswordForm.style.display = "none";
    return false;
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  showResetMessage("");

  const password = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const otp = resetOtpInput.value.trim();
  const token = getTokenFromUrl();

  if (!token) {
    showResetMessage("The reset link is missing or invalid.");
    return;
  }

  if (!otp || !password || !confirmPassword) {
    showResetMessage("Please enter the reset code and confirm your new password.");
    return;
  }

  if (!/^\d{6}$/.test(otp)) {
    showResetMessage("The reset code must be 6 digits.");
    return;
  }

  if (password !== confirmPassword) {
    showResetMessage(
      "Passwords do not match. Please enter the same password twice.",
    );
    return;
  }

  if (password.length < 8) {
    showResetMessage("Password must be at least 8 characters long.");
    return;
  }

  setResetLoading(true);

  const apiUrl = `${getApiBaseUrl()}/api/auth/reset-password`;
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, otp, password, confirmPassword }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      showResetMessage(data.message || "Unable to reset your password.");
      return;
    }

    showResetMessage(
      data.message || "Password has been reset successfully.",
      false,
    );
    resetPasswordForm.reset();
  } catch (error) {
    console.error("Reset password failed:", error);
    showResetMessage("Unable to reach the server. Please try again later.");
  } finally {
    setResetLoading(false);
  }
}

(async () => {
  const token = getTokenFromUrl();
  if (!token) {
    showResetMessage("The reset link is missing or invalid.");
    if (resetPasswordForm) {
      resetPasswordForm.style.display = "none";
    }
    return;
  }

  const valid = await validateResetToken(token);
  if (valid && resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", handleResetPassword);
  }
})();
