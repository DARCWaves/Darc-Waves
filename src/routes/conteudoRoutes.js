const express = require("express");
const router = express.Router();
const config = require("../config");

const OPENAI_API_KEY = config.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const MODEL_TEXT = config.MODEL_TEXT || "gpt-4o-mini";
const MODEL_IMAGE = config.MODEL_IMAGE || "gpt-image-1";

function validarChave() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
}

function limparJSON(texto) {
  let t = String(texto || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");

  if (ini !== -1 && fim !== -1) {
    t = t.slice(ini, fim + 1);
  }

  return t;
}

async function chamarOpenAITexto(prompt) {
  validarChave();

  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_TEXT,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: "Você cria carrosséis profissionais para redes sociais. Responda apenas JSON válido quando solicitado."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const data = await resposta.json();

  if (!resposta.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data.choices?.[0]?.message?.content || "";
}

async function gerarConteudoHandler(req, res) {
  try {
    const tema =
      req.body?.tema ||
      req.query?.tema ||
      req.body?.prompt ||
      req.query?.prompt ||
      "";

    if (!tema || String(tema).trim().length < 3) {
      return res.json({
        ok: false,
        erro: "Tema inválido",
        detalhes: "Digite um tema com pelo menos 3 caracteres."
      });
    }

    const prompt = `
Crie um carrossel completo sobre: "${tema}"

RETORNE APENAS JSON VÁLIDO.

Formato obrigatório:
{
  "texto": "Legenda completa e persuasiva",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "slides": [
    {
      "titulo": "Título do slide 1",
      "texto": "Texto curto do slide 1",
      "promptImagem": "Descrição visual para gerar imagem"
    }
  ]
}

Regras:
- exatamente 6 slides
- slide 1 é capa forte
- slides 2 a 5 entregam conteúdo
- slide 6 chama para seguir, salvar ou compartilhar
- português do Brasil
`;

    const textoIA = await chamarOpenAITexto(prompt);
    const json = JSON.parse(limparJSON(textoIA));

    res.json({
      ok: true,
      texto: json.texto || "",
      hashtags: Array.isArray(json.hashtags) ? json.hashtags : [],
      slides: Array.isArray(json.slides) ? json.slides.slice(0, 6) : []
    });

  } catch (err) {
    console.log("[ERRO /gerar-conteudo]", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar conteúdo",
      detalhes: err.message
    });
  }
}

async function gerarImagemHandler(req, res) {
  try {
    validarChave();

    const prompt =
      req.body?.prompt ||
      req.query?.prompt ||
      req.body?.promptImagem ||
      req.query?.promptImagem ||
      "";

    if (!prompt || String(prompt).trim().length < 3) {
      return res.json({
        ok: false,
        erro: "Prompt de imagem inválido"
      });
    }

    const resposta = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_IMAGE,
        size: "1024x1024",
        prompt: `
Imagem profissional para carrossel de Instagram.

${prompt}

Regras:
- sem texto escrito na imagem
- sem marca d'água
- visual moderno
- alta qualidade
- formato quadrado
`
      })
    });

    const data = await resposta.json();

    if (!resposta.ok) {
      throw new Error(JSON.stringify(data));
    }

    const img = data?.data?.[0]?.b64_json;

    if (!img) {
      throw new Error("Imagem não retornada pela OpenAI");
    }

    res.json({
      ok: true,
      imagem: `data:image/png;base64,${img}`
    });

  } catch (err) {
    console.log("[ERRO /gerar-imagem]", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar imagem",
      detalhes: err.message
    });
  }
}

router.get("/gerar-conteudo", gerarConteudoHandler);
router.post("/gerar-conteudo", gerarConteudoHandler);

router.get("/gerar-imagem", gerarImagemHandler);
router.post("/gerar-imagem", gerarImagemHandler);

module.exports = router;
