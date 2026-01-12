document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const accessKey = document.getElementById("accessKey").value.trim();
  const statusEl = document.getElementById("status");

  if (!email || !accessKey) {
    statusEl.textContent = "Please enter both email and access key";
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, accessKey })
    });

    const data = await res.json();

    if (res.ok) {
      // Store JWT in localStorage for official.html
      localStorage.setItem("JWT_TOKEN", data.token);

      // Optional: store email for display
      localStorage.setItem("EMAIL", email);

      // Redirect to official chat page
      window.location.href = "/official.html";
    } else {
      statusEl.textContent = "❌ " + data.error;
    }
  } catch (err) {
    statusEl.textContent = "❌ " + err.message;
  }
});
