const MODEL = "gpt-5.4-nano";

function assertAuthorizedModel() {
  if (MODEL !== "gpt-5.4-nano") {
    throw new Error("Unauthorized model");
  }
}

module.exports = {
  MODEL,
  assertAuthorizedModel
};
