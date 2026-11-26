const fs = require("fs");
const lines = fs.readFileSync("assets/app.js", "utf8").split(/\r?\n/);
["bindStaticEvents", "compressImage", "data-action=\"", "showModal"].forEach((term) => {
  console.log("=== " + term);
  lines.forEach((line, i) => {
    if (line.includes(term)) console.log(String(i + 1).padStart(4) + ": " + line.trim().slice(0, 180));
  });
});
