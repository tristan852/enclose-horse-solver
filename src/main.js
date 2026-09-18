const bookmarklet = `javascript:(function(){var l=window.__LEVEL__;if(!l){alert('Open an enclose.horse puzzle first.');return}var w=window.open('about:blank','_blank');var d=(window.__DAILY_LEVELS__||[]).filter(function(x){return String(x.dayNumber)===String(l.dayNumber)||x.id===l.id})[0]||{};var bid=l.bonusId||d.bonusId||(l.bonus&&l.bonus.id);var enc=function(o){var a=new TextEncoder().encode(JSON.stringify(o)),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)};var done=function(b){var u="https://tristan852.github.io/enclose-horse-solver/"+'?level=%27+encodeURIComponent(enc(l))+(b?%27&bonus=%27+encodeURIComponent(enc(b)):%27%27);if(w&&!w.closed)w.location=u;else location.href=u};if(bid){fetch(%27/api/daily/bonus/%27+encodeURIComponent(l.id)).then(function(r){if(!r.ok)throw Error(%27Bonus request failed (%27+r.status+%27)%27);return r.json()}).then(function(b){b.type=l.bonusType||d.bonusType||(l.bonus&&l.bonus.type)||%27default%27;var names={costlywalls:%27Costly Walls%27,lovebirds:%27Lovebirds%27,loversquarrel:%27Lovers Quarrel%27};b.name=%27Bonus round: %27+(names[String(b.type).toLowerCase()]||String(b.type).replace(/[-_]+/g,%27 %27));done(b)}).catch(function(e){if(w&&!w.closed)w.close();alert(%27Could not prepare this puzzle: %27+e.message)})}else done(null)})()`

document.getElementById("bookmark").href = bookmarklet;

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
