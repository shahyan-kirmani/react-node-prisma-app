export function getAuth() {
  const token = localStorage.getItem("token");

  let user = null;
  try {
    const raw = localStorage.getItem("user");
    if (raw && raw !== "undefined" && raw !== "null") {
      user = JSON.parse(raw);
    }
  } catch (e) {
    user = null;
  }

  return { token, user };
}

export function setAuth(token, user) {
  localStorage.setItem("token", token || "");
  localStorage.setItem("user", JSON.stringify(user ?? null));
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
