require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const TIMEOUT = 60000;
const MAX_RETRIES = 3;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   VALIDAÇÃO DE AMBIENTE
========================= */
function validarConfig() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
}

/* =========================
   UTILITÁRIOS
========================= */
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function limparJSON(texto) {
  if (!texto) return "";

  let t = texto
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // tenta extrair só o JSON se vier texto misturado
  const primeiro = t.indexOf("{");
  const ultimo = t.lastIndexOf("}");

  if (primeiro !== -1 && ultimo !== -1) {
    t = t.substring(primeiro, ultimo + 1);
  }

  return t;
}

async function fetchComRetry(url, options, tentativas = MAX_RETRIES) {
  let erroFinal;

  for (let i = 0; i < tentativas; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const erro = await res.text();
        throw new Error(`Erro ${res.status}: ${erro}`);
      }

      return await res.json();
    } catch (err) {
      erroFinal = err;
      console.log(`Tentativa ${i + 1} falhou:`, err.message);

      if (i < tentativas - 1) {
        await delay(2000 * (i + 1));
      }
    }
  }

  throw erroFinal;
}

/* =========================
   GERAR CONTEÚDO
========================= */
app.get("/gerar-conteudo", async (req, res) => {
  try {
    validarConfig();

    const tema = (req.query.tema || "").trim();

    if (!tema || tema.length < 3) {
      return res.json({ ok: false, erro: "Tema inválido" });
    }

    const prompt = `
Crie um carrossel sobre: "${tema}"

RETORNE APENAS JSON VÁLIDO.

PROIBIDO:
- markdown
- explicações
- texto fora do JSON

Formato obrigatório:
{
  "texto": "",
  "hashtags": ["", "", "", ""],
  "slides": [
    {
      "titulo": "",
      "texto": "",
      "promptImagem": ""
    }
  ]
}

Regras:
- 6 slides obrigatórios
- slide 1 = capa chamativa
- slides 2-6 = conteúdo direto
`;

    const data = await fetchComRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.9
        })
      }
    );

    const texto = data.choices?.[0]?.message?.content;

    if (!texto) {
      throw new Error("Resposta vazia da OpenAI");
    }

    const textoLimpo = limparJSON(texto);

    let json;

    try {
      json = JSON.parse(textoLimpo);
    } catch (err) {
      console.log("========== DEBUG IA ==========");
      console.log("RESPOSTA ORIGINAL:\n", texto);
      console.log("RESPOSTA LIMPA:\n", textoLimpo);
      console.log("================================");

      throw new Error("JSON inválido retornado pela IA");
    }

    if (!json.slides || !Array.isArray(json.slides) || json.slides.length === 0) {
      throw new Error("IA não retornou slides válidos");
    }

    res.json({
      ok: true,
      texto: json.texto || "",
      hashtags: json.hashtags || [],
      slides: json.slides.slice(0, 6)
    });

  } catch (err) {
    console.log("Erro conteúdo:", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar conteúdo"
    });
  }
});

/* =========================
   GERAR IMAGEM (OPENAI)
========================= */
app.get("/gerar-imagem", async (req, res) => {
  try {
    validarConfig();

    const prompt = (req.query.prompt || "").trim();

    if (!prompt) {
      return res.json({ ok: false, erro: "Prompt inválido" });
    }

    const data = await fetchComRetry(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: `
Imagem profissional para Instagram:

${prompt}

Regras:
- sem texto
- sem marca d'água
- alta qualidade
- visual moderno
`,
          size: "1024x1024"
        })
      }
    );

    const img = data.data?.[0]?.b64_json;

    if (!img) {
      throw new Error("Imagem não gerada");
    }

    res.json({
      ok: true,
      imagem: `data:image/png;base64,${img}`
    });

  } catch (err) {
    console.log("Erro imagem:", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar imagem"
    });
  }
});

/* =========================
   ROTAS AUXILIARES
========================= */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   ERRO GLOBAL
========================= */
app.use((err, req, res, next) => {
  console.log("Erro global:", err.message);
  res.status(500).json({ ok: false });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
