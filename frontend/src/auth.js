export function getAuth() {
  return {
    token: localStorage.getItem("token"),
    user: JSON.parse(localStorage.getItem("user") || "null"),
  };
}

export function setAuth(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
