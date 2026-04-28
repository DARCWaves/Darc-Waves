const express = require("express");
const router = express.Router();

const limitarUso = require("../middlewares/limiteFree");

// Rota principal com limite gratuito aplicado
router.post("/gerar-conteudo", limitarUso, async (req, res) => {
  try {
    const { tema } = req.body;

    if (!tema) {
      return res.status(400).json({
        ok: false,
        erro: "Tema obrigatório"
      });
    }

    // Resposta temporária (pode conectar com IA depois)
    res.json({
      ok: true,
      texto: `Conteúdo gerado sobre: ${tema}`,
      hashtags: "#marketing #conteudo #viral",
      slides: [
        { titulo: "Slide 1", texto: "Introdução", imagem: null },
        { titulo: "Slide 2", texto: "Conteúdo", imagem: null },
        { titulo: "Slide 3", texto: "Finalização", imagem: null }
      ]
    });

  } catch (err) {
    console.error("[ERRO /gerar-conteudo]", err.message);

    res.status(500).json({
      ok: false,
      erro: "Erro ao gerar conteúdo",
      detalhes: err.message
    });
  }
});

module.exports = router;
