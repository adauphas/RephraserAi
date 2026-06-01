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

async function callOpenAI(systemPrompt, userContent) {
  // userContent peut etre une chaine (texte seul) ou un tableau de parts (texte + images).
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
          content: systemPrompt
        },
        {
          role: "user",
          content: userContent
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

async function rewriteWithOpenAI(prompt) {
  return callOpenAI(
    "Tu transformes des textes avec precision. Tu retournes uniquement le texte final, sans explication.",
    prompt
  );
}

// Assistant conversationnel libre (section "Discuter avec l'IA", reservee aux comptes premium).
// images : tableau optionnel d'URL data (data:image/...;base64,...). On les envoie en
// "detail": "low" pour plafonner le cout (forfait ~85 tokens par image).
async function chatWithOpenAI(message, images = []) {
  const systemPrompt = "Tu es l'assistant IA de Rephraser AI. Tu reponds de maniere claire, utile et concise a la question de l'utilisateur. Si une ou plusieurs images sont fournies, analyse-les pour repondre. Reponds dans la meme langue que la question.";

  if (Array.isArray(images) && images.length > 0) {
    const content = [{ type: "input_text", text: message }];
    for (const image of images) {
      content.push({
        type: "input_image",
        image_url: image,
        detail: "low"
      });
    }
    return callOpenAI(systemPrompt, content);
  }

  return callOpenAI(systemPrompt, message);
}

module.exports = {
  rewriteWithOpenAI,
  chatWithOpenAI
};
