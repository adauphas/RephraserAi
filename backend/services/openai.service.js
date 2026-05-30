const { MODEL, assertAuthorizedModel } = require("../config/openai");

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const texts = [];

  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === "string") {
        texts.push(part.text);
      }
    }
  }

  return texts.join("\n").trim();
}

async function rewriteWithOpenAI(prompt) {
  assertAuthorizedModel();

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante cote backend.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content: "Tu transformes des textes avec precision. Tu retournes uniquement le texte final, sans explication."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || "Erreur lors de l'appel OpenAI.";
    throw new Error(message);
  }

  const text = extractOutputText(payload);

  if (!text) {
    throw new Error("OpenAI n'a retourne aucun texte exploitable.");
  }

  return text;
}

module.exports = {
  rewriteWithOpenAI
};
