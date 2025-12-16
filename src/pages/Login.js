import authConfig from "../authConfig";

export default function Login() {
  const loginUrl =
    `${authConfig.domain}/login` +
    `?client_id=${authConfig.clientId}` +
    `&response_type=${authConfig.responseType}` +
    `&scope=${encodeURIComponent(authConfig.scope)}` +
    `&redirect_uri=${encodeURIComponent(authConfig.redirectUri)}`;

  window.location.href = loginUrl;

  return null;
}
