const express = require("express");
const app = express();

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.static("public"));

app.listen(7777).on("listening", () => {
  console.log("Server is running on http://localhost:7777");
});
