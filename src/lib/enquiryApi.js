export async function submitEnquiry(apiUrl, payload) {
  if (!apiUrl) {
    throw new Error("Missing enquiry API URL.");
  }
  const trimmed = apiUrl.replace(/\/+$/, "");
  const url = `${trimmed}/enquiry`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Enquiry request failed (${response.status}).`);
  }

  const data = await response.json();
  if (!data?.ok) {
    throw new Error("Enquiry request did not succeed.");
  }

  return data;
}
