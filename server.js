const express = require("express");
const path = require("path");
const config = require("./src/config");

const conteudoRoutes = require("./src/routes/conteudoRoutes");

const app = express();

// Middlewares básicos
app.use(express.json());

// 🔥 SERVIR ARQUIVOS ESTÁTICOS (AdSense / páginas públicas)
app.use(express.static(path.join(__dirname, "public")));

// Rotas da API
app.use("/", conteudoRoutes);

// Rota principal (fallback para index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Inicialização
app.listen(config.PORT, () => {
  console.log("Servidor rodando na porta", config.PORT);
});
