const params = new URLSearchParams(window.location.search);

const levelEncoded = params.get("level");
const bonusEncoded = params.get("bonus");

function decode(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

if (!levelEncoded) {
  console.log("No puzzle supplied.");
} else {
  const level = decode(levelEncoded);
  const bonus = bonusEncoded ? decode(bonusEncoded) : null;

  console.log("Level:", level);
  console.log("Bonus:", bonus);
}
